using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace NinetyAgent.Watchdog;

public sealed class WatchdogService : BackgroundService
{
    private const int IntentionalExitCode = 0;

    private readonly AgentProcessSupervisor _supervisor;
    private readonly ILogger<WatchdogService> _logger;

    public WatchdogService(AgentProcessSupervisor supervisor, ILogger<WatchdogService> logger)
    {
        _supervisor = supervisor;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("NinetyAgent Watchdog starting supervise loop.");

        Process current;
        try
        {
            current = _supervisor.EnsureRunning();
        }
        catch (Exception ex)
        {
            _logger.LogCritical(ex, "Could not start the agent on watchdog startup. Retrying in 10s.");
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken).ConfigureAwait(false);
            current = _supervisor.EnsureRunning();
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await current.WaitForExitAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (Win32Exception ex) when (ex.NativeErrorCode == 5) // Error 5 = Access Denied
            {
                _logger.LogWarning("Access denied when attaching exit handle to PID {Pid}. Falling back to polling check.", current.Id);

                // Fallback polling loop when Windows restricts process handle synchronization rights
                while (!stoppingToken.IsCancellationRequested)
                {
                    await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken).ConfigureAwait(false);
                    try
                    {
                        if (current.HasExited) break;
                    }
                    catch
                    {
                        break;
                    }
                }
            }
            catch (OperationCanceledException)
            {
                break; // Service is stopping (e.g. `sc.exe stop`) — do not respawn
            }

            if (stoppingToken.IsCancellationRequested) break;

            var exitCode = SafeGetExitCode(current);
            current.Dispose();

            if (exitCode == IntentionalExitCode)
            {
                _logger.LogInformation("Agent exited intentionally (code 0). Watchdog will not respawn until next service start.");
                var relaunched = await WaitForManualOrScheduledRelaunchSignalAsync(stoppingToken).ConfigureAwait(false);
                if (relaunched is null) break;
                current = relaunched;
                continue;
            }

            current = await _supervisor.RespawnAsync(exitCode, stoppingToken).ConfigureAwait(false);
        }

        _logger.LogInformation("NinetyAgent Watchdog supervise loop exiting.");
    }

    private static int SafeGetExitCode(Process process)
    {
        try { return process.ExitCode; }
        catch { return -1; }
    }

    private async Task<Process?> WaitForManualOrScheduledRelaunchSignalAsync(CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(30), ct).ConfigureAwait(false);

                // Search for NinetyAgent.Client process first, falling back to NinetyAgent
                var running = Process.GetProcessesByName("NinetyAgent.Client").FirstOrDefault(p => !p.HasExited)
                    ?? Process.GetProcessesByName("NinetyAgent").FirstOrDefault(p => !p.HasExited);

                if (running is not null)
                {
                    _logger.LogInformation("Agent (PID {Pid}) is running again; watchdog resuming active supervision.", running.Id);
                    return running;
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Fall through to null — service is stopping
        }

        return null;
    }
}