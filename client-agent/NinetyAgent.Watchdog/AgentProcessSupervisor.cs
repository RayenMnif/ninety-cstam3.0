using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;

namespace NinetyAgent.Watchdog;

public sealed class AgentProcessSupervisor
{
    private const int MaxRestartsInWindow = 5;
    private static readonly TimeSpan CrashLoopWindow = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan CrashLoopCooldown = TimeSpan.FromMinutes(1);

    private readonly ILogger<AgentProcessSupervisor> _logger;
    private readonly string _agentExecutablePath;
    private readonly Queue<DateTimeOffset> _recentRestarts = new();

    public AgentProcessSupervisor(ILogger<AgentProcessSupervisor> logger)
    {
        _logger = logger;
        _agentExecutablePath = ResolveAgentExecutablePath();
    }

    private static string ResolveAgentExecutablePath()
    {
        var overridePath = Environment.GetEnvironmentVariable("NINETY_AGENT_EXE_PATH");
        if (!string.IsNullOrWhiteSpace(overridePath)) return overridePath;

        var watchdogDir = AppContext.BaseDirectory;
        // Fix executable name to match NinetyAgent.Client.exe
        var candidate = Path.GetFullPath(Path.Combine(watchdogDir, "..", "Client", "NinetyAgent.Client.exe"));
        if (!File.Exists(candidate))
        {
            // Secondary fallback if compiled as NinetyAgent.exe
            var alternative = Path.GetFullPath(Path.Combine(watchdogDir, "..", "Client", "NinetyAgent.exe"));
            if (File.Exists(alternative)) return alternative;
        }

        return candidate;
    }

    public Process EnsureRunning()
    {
        // Bypass active process launching/killing while debugging in Visual Studio
        if (Debugger.IsAttached)
        {
            _logger.LogInformation("Debugger attached; skipping Watchdog enforcement.");
            var debugProcess = GetAgentProcess();
            if (debugProcess != null) return debugProcess;
        }

        // Search for NinetyAgent.Client instead of NinetyAgent
        var existing = GetAgentProcess();
        if (existing is not null)
        {
            _logger.LogInformation("Agent already running (PID {Pid}); attaching supervisor.", existing.Id);
            return existing;
        }

        return Launch();
    }

    public async Task<Process> RespawnAsync(int exitCode, CancellationToken ct)
    {
        _logger.LogWarning("Agent process exited with code {ExitCode}. Evaluating respawn policy...", exitCode);

        PruneOldRestarts();
        if (_recentRestarts.Count >= MaxRestartsInWindow)
        {
            _logger.LogError("Agent has crashed {Count} times in last window. Cooling down...", _recentRestarts.Count);
            await Task.Delay(CrashLoopCooldown, ct).ConfigureAwait(false);
        }

        return Launch();
    }

    private Process Launch()
    {
        if (!File.Exists(_agentExecutablePath))
        {
            _logger.LogCritical("Cannot find agent executable at '{Path}'.", _agentExecutablePath);
            throw new FileNotFoundException("Agent executable not found.", _agentExecutablePath);
        }

        try
        {
            if (LaunchInInteractiveSession())
            {
                var agent = GetAgentProcess();
                if (agent != null) return agent;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Interactive session launch failed; falling back to standard Process.Start");
        }

        return LaunchFallback();
    }

    private bool LaunchInInteractiveSession()
    {
        _logger.LogInformation("Attempting to launch agent into interactive user session...");
        nint pSessionInfo = IntPtr.Zero;
        uint sessionCount = 0;

        if (!NativeMethods.WTSEnumerateSessions((nint)NativeMethods.WTS_CURRENT_SERVER_HANDLE, 0, 1, out pSessionInfo, out sessionCount))
        {
            _logger.LogWarning("WTSEnumerateSessions failed; falling back to standard launch");
            return false;
        }

        try
        {
            int structSize = Marshal.SizeOf(typeof(NativeMethods.WTS_SESSION_INFO));
            var sessions = new NativeMethods.WTS_SESSION_INFO[sessionCount];

            for (int i = 0; i < sessionCount; i++)
            {
                var pItem = IntPtr.Add(pSessionInfo, i * structSize);
                sessions[i] = Marshal.PtrToStructure<NativeMethods.WTS_SESSION_INFO>(pItem);
            }

            var interactiveSession = sessions.FirstOrDefault(s =>
                (s.State == NativeMethods.WTS_CONNECTSTATE_CLASS.WTSActive ||
                 s.State == NativeMethods.WTS_CONNECTSTATE_CLASS.WTSConnected) &&
                s.SessionID != 0);

            if (interactiveSession.SessionID == 0)
            {
                _logger.LogWarning("No active interactive session found");
                return false;
            }

            uint sessionId = interactiveSession.SessionID;
            _logger.LogInformation("Found interactive session ID: {SessionID}", sessionId);

            nint userToken = IntPtr.Zero;
            if (!NativeMethods.WTSQueryUserToken(sessionId, out userToken))
            {
                _logger.LogWarning("WTSQueryUserToken failed for session {SessionID}", sessionId);
                return false;
            }

            try
            {
                var processInfo = new NativeMethods.PROCESS_INFORMATION();
                var startupInfo = new NativeMethods.STARTUPINFO
                {
                    cb = (uint)Marshal.SizeOf(typeof(NativeMethods.STARTUPINFO))
                };

                var agentDir = Path.GetDirectoryName(_agentExecutablePath);
                var success = NativeMethods.CreateProcessAsUser(
                    userToken,
                    _agentExecutablePath,
                    null,
                    IntPtr.Zero,
                    IntPtr.Zero,
                    false,
                    0,
                    IntPtr.Zero,
                    agentDir ?? _agentExecutablePath,
                    ref startupInfo,
                    out processInfo);

                if (!success)
                {
                    int error = Marshal.GetLastWin32Error();
                    _logger.LogWarning("CreateProcessAsUser failed with error {ErrorCode}", error);
                    return false;
                }

                _logger.LogInformation("Agent launched into session {SessionID} (PID {PID})", sessionId, processInfo.dwProcessId);
                _recentRestarts.Enqueue(DateTimeOffset.UtcNow);

                if (processInfo.hProcess != IntPtr.Zero) NativeMethods.CloseHandle(processInfo.hProcess);
                if (processInfo.hThread != IntPtr.Zero) NativeMethods.CloseHandle(processInfo.hThread);

                return true;
            }
            finally
            {
                if (userToken != IntPtr.Zero) NativeMethods.CloseHandle(userToken);
            }
        }
        finally
        {
            if (pSessionInfo != IntPtr.Zero) NativeMethods.WTSFreeMemory(pSessionInfo);
        }
    }

    private Process LaunchFallback()
    {
        var startInfo = new ProcessStartInfo(_agentExecutablePath)
        {
            UseShellExecute = false,
            WorkingDirectory = Path.GetDirectoryName(_agentExecutablePath),
        };

        var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("Process.Start returned null unexpectedly.");

        _recentRestarts.Enqueue(DateTimeOffset.UtcNow);
        _logger.LogInformation("Launched agent via fallback (PID {Pid}) from '{Path}'.", process.Id, _agentExecutablePath);
        return process;
    }

    private Process? GetAgentProcess()
    {
        try
        {
            // Look for NinetyAgent.Client process, falling back to NinetyAgent
            return Process.GetProcessesByName("NinetyAgent.Client").FirstOrDefault(p => !p.HasExited)
                ?? Process.GetProcessesByName("NinetyAgent").FirstOrDefault(p => !p.HasExited);
        }
        catch
        {
            return null;
        }
    }

    private void PruneOldRestarts()
    {
        var cutoff = DateTimeOffset.UtcNow - CrashLoopWindow;
        while (_recentRestarts.Count > 0 && _recentRestarts.Peek() < cutoff)
        {
            _recentRestarts.Dequeue();
        }
    }
}