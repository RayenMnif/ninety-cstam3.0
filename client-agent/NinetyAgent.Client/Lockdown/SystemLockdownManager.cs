using Microsoft.Win32;
using NinetyAgent.Client.Core;
using NinetyAgent.Client.Interop;
using NinetyAgent.Client.Networking;
using System.Windows;
using System.Collections.ObjectModel;
using System.IO;
using System;

namespace NinetyAgent.Client.Lockdown;

public sealed record MonitorBounds(int Left, int Top, int Width, int Height, bool IsPrimary);

/// <summary>
/// The single entry point for "lock this station down" / "release it". Coordinates three
/// independent defense layers so no one of them being individually bypassable breaks the whole
/// system:
///   1. <see cref="LowLevelKeyboardHook"/>  — suppresses Win key / Alt+Tab / Alt+Esc / Ctrl+Esc.
///   2. HKCU policy keys                    — disables Task Manager via the same registry values
///                                             Group Policy itself would set (DisableTaskMgr),
///                                             so a killed/relaunched Explorer still honors it.
///   3. Per-monitor topmost overlay windows — even if 1 and 2 were somehow both defeated, there
///      is a covering, always-on-top window sized to every physical monitor, so there is no
///      underlying desktop pixel a bypass could click on to begin with.
/// A foreground-window watchdog timer re-asserts topmost + focus a few times a second, because
/// certain UAC-elevated or protected system dialogs (e.g. AV prompts) can legitimately steal
/// foreground even from a topmost window — we detect that and immediately reclaim it.
/// </summary>
public sealed class SystemLockdownManager : IDisposable
{
    private readonly ILogSink _log;
    private readonly LowLevelKeyboardHook _keyboardHook;
    private System.Windows.Threading.DispatcherTimer? _foregroundWatchdog;
    private readonly List<nint> _overlayHandles = new();
    private readonly List<Window> _overlayWindows = new();
    private bool _taskManagerWasDisabledByUs;

    public event Action<string>? BypassAttemptBlocked; // forwarded from the keyboard hook, for SECURITY_ALERT

    public SystemLockdownManager(ILogSink log)
    {
        _log = log;
        _keyboardHook = new LowLevelKeyboardHook(log);
        _keyboardHook.BypassAttemptBlocked += desc => BypassAttemptBlocked?.Invoke(desc);
    }

    private static void WriteUiDebugLog(string message)
    {
        try
        {
            var logDir = @"C:\ProgramData\NinetyAgent\logs";
            Directory.CreateDirectory(logDir);
            var logFile = Path.Combine(logDir, "ui_debug.log");
            File.AppendAllText(logFile, $"{DateTime.Now:O} {message}{Environment.NewLine}");
        }
        catch { }
    }

    /// <summary>Call once at agent startup — the hook stays installed for the process lifetime; SuppressionEnabled toggles the actual blocking.</summary>
    public void Initialize()
    {
        _keyboardHook.Install();
    }

    // ------------------------------------------------------------------
    // Lock / Unlock
    // ------------------------------------------------------------------

    public void EngageLock()
    {
        _keyboardHook.SuppressionEnabled = true;
        DisableTaskManager();
        _log.Info("[Lockdown] Station locked: shortcuts suppressed, Task Manager disabled.");
        WriteUiDebugLog("[Lockdown] EngageLock invoked");

        // Create per-monitor overlay windows on the WPF UI thread so the user cannot interact
        // with the desktop. Do this defensively via the Application dispatcher in case EngageLock
        // is called from a non-UI thread (our bootstrap often runs on threadpool threads).
        try
        {
            if (Application.Current is null)
            {
                _log.Error("[Lockdown] Application.Current is null; cannot create overlay windows.");
                WriteUiDebugLog("[Lockdown] Application.Current is null; cannot create overlay windows.");
                return;
            }

            // Dispatch to UI thread with explicit priority to ensure windows render
            Application.Current.Dispatcher.Invoke(() =>
            {
                try
                {
                    var monitors = EnumerateMonitors();
                    _log.Info($"[Lockdown] Enumerating {monitors.Count} monitors for overlay creation.");
                    WriteUiDebugLog($"[Lockdown] Enumerating {monitors.Count} monitors for overlay creation.");

                    if (monitors.Count == 0)
                    {
                        _log.Warn("[Lockdown] No monitors detected; overlay windows not created.");
                        WriteUiDebugLog("[Lockdown] No monitors detected; overlay windows not created.");
                        return;
                    }

                    foreach (var m in monitors)
                    {
                        try
                        {
                            _log.Info($"[Lockdown] Creating overlay for monitor: bounds=({m.Left},{m.Top}) size=({m.Width}x{m.Height}) primary={m.IsPrimary}");
                            WriteUiDebugLog($"[Lockdown] Creating overlay for monitor: bounds=({m.Left},{m.Top}) size=({m.Width}x{m.Height}) primary={m.IsPrimary}");

                            var win = new KioskOverlayWindow(m, m.IsPrimary);
                            win.Show();
                            win.Activate(); // Bring window to foreground
                            win.Topmost = true; // Re-assert topmost in case Show() didn't stick

                            _overlayWindows.Add(win);
                            RegisterOverlayHandle(win.Handle);

                            _log.Info($"[Lockdown] Overlay created and shown successfully.");
                            WriteUiDebugLog($"[Lockdown] Overlay created for monitor handle={win.Handle}");
                        }
                        catch (Exception exWindow)
                        {
                            _log.Error($"[Lockdown] Failed to create overlay for monitor ({m.Left},{m.Top}).", exWindow);
                            WriteUiDebugLog($"[Lockdown] Failed to create overlay for monitor ({m.Left},{m.Top}): {exWindow}");
                        }
                    }

                    _log.Info($"[Lockdown] {_overlayWindows.Count} overlay windows created.");
                    WriteUiDebugLog($"[Lockdown] {_overlayWindows.Count} overlay windows created.");
                }
                catch (Exception ex)
                {
                    _log.Error("[Lockdown] Failed to create overlay windows during dispatcher call.", ex);
                    WriteUiDebugLog($"[Lockdown] Failed to create overlay windows during dispatcher call: {ex}");
                }
            }, System.Windows.Threading.DispatcherPriority.Send); // Use Send priority for immediate execution
        }
        catch (Exception ex)
        {
            _log.Error("[Lockdown] Could not dispatch overlay creation to UI thread.", ex);
        }
    }

    public void ReleaseLock()
    {
        _keyboardHook.SuppressionEnabled = false;
        RestoreTaskManager();
        _log.Info("[Lockdown] Station unlocked: shortcuts and Task Manager restored.");

        // Close overlay windows on UI thread
        try
        {
            Application.Current?.Dispatcher.Invoke(() =>
            {
                foreach (var w in _overlayWindows)
                {
                    try { w.Close(); } catch { }
                }
                _overlayWindows.Clear();
                _overlayHandles.Clear();
            });
        }
        catch (Exception ex)
        {
            _log.Error("[Lockdown] Could not dispatch overlay teardown to UI thread.", ex);
        }
    }

    // ------------------------------------------------------------------
    // Task Manager policy (HKCU — matches what Group Policy itself writes,
    // so it survives an Explorer.exe restart and needs no admin rights)
    // ------------------------------------------------------------------

    private const string PoliciesSystemKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Policies\System";
    private const string DisableTaskMgrValueName = "DisableTaskMgr";

    private void DisableTaskManager()
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(PoliciesSystemKeyPath, writable: true);
            var existing = key.GetValue(DisableTaskMgrValueName);
            if (existing is null or 0)
            {
                key.SetValue(DisableTaskMgrValueName, 1, RegistryValueKind.DWord);
                _taskManagerWasDisabledByUs = true;
            }
        }
        catch (Exception ex)
        {
            // Non-fatal: the keyboard hook + overlay windows are the primary defenses; the
            // registry policy is defense-in-depth. Log and continue rather than crash the agent.
            _log.Error("[Lockdown] Could not write DisableTaskMgr policy (non-fatal).", ex);
        }
    }

    private void RestoreTaskManager()
    {
        if (!_taskManagerWasDisabledByUs) return; // don't clobber a policy an admin set on purpose
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(PoliciesSystemKeyPath, writable: true);
            key?.DeleteValue(DisableTaskMgrValueName, throwOnMissingValue: false);
            _taskManagerWasDisabledByUs = false;
        }
        catch (Exception ex)
        {
            _log.Error("[Lockdown] Could not clear DisableTaskMgr policy (non-fatal).", ex);
        }
    }

    // ------------------------------------------------------------------
    // Multi-monitor enumeration
    // ------------------------------------------------------------------

    /// <summary>
    /// Enumerates every physical display via EnumDisplayMonitors rather than relying on WPF's
    /// SystemParameters.VirtualScreen* bounding box. The bounding box is wrong (leaves live
    /// desktop gaps clickable) whenever monitors are arranged non-contiguously or with mixed
    /// resolutions/DPI, which is common on multi-rig gaming stations built up over time with
    /// mismatched hardware. One overlay window is created per entry this returns.
    /// </summary>
    public static IReadOnlyList<MonitorBounds> EnumerateMonitors()
    {
        var results = new List<MonitorBounds>();

        bool Callback(nint hMonitor, nint hdc, ref NativeMethods.RECT rect, nint data)
        {
            var info = new NativeMethods.MONITORINFOEX
            {
                cbSize = System.Runtime.InteropServices.Marshal.SizeOf<NativeMethods.MONITORINFOEX>()
            };
            if (NativeMethods.GetMonitorInfo(hMonitor, ref info))
            {
                const uint MONITORINFOF_PRIMARY = 0x1;
                results.Add(new MonitorBounds(
                    info.rcMonitor.Left, info.rcMonitor.Top,
                    info.rcMonitor.Width, info.rcMonitor.Height,
                    (info.dwFlags & MONITORINFOF_PRIMARY) != 0));
            }
            return true; // keep enumerating
        }

        NativeMethods.EnumDisplayMonitors(0, 0, Callback, 0);
        return results;
    }

    // ------------------------------------------------------------------
    // Foreground-window enforcement
    // ------------------------------------------------------------------

    /// <summary>Registers an overlay window's handle so the watchdog knows it's one of "ours" and won't fight itself for focus.</summary>
    public void RegisterOverlayHandle(nint hwnd) => _overlayHandles.Add(hwnd);

    /// <summary>
    /// Starts a ~4Hz timer that re-asserts topmost + foreground on our overlay windows if
    /// something else (a legitimately elevated dialog, a race during Explorer restart, etc.)
    /// manages to steal it. 4Hz is a deliberate trade-off: fast enough that a human can never
    /// see or interact with the desktop underneath even briefly, cheap enough (a couple of
    /// P/Invoke calls) to stay well inside the <0.5% CPU budget while LOCKED.
    /// </summary>
    public void StartForegroundWatchdog()
    {
        _foregroundWatchdog = new System.Windows.Threading.DispatcherTimer(
            System.Windows.Threading.DispatcherPriority.Send)
        {
            Interval = TimeSpan.FromMilliseconds(250)
        };
        _foregroundWatchdog.Tick += (_, _) => ReassertTopmost();
        _foregroundWatchdog.Start();
    }

    public void StopForegroundWatchdog() => _foregroundWatchdog?.Stop();

    private void ReassertTopmost()
    {
        if (!_keyboardHook.SuppressionEnabled) return; // only fight for focus while actually locked

        var fg = NativeMethods.GetForegroundWindow();
        if (_overlayHandles.Contains(fg)) return; // we already own focus — nothing to do

        foreach (var handle in _overlayHandles)
        {
            NativeMethods.SetWindowPos(handle, NativeMethods.HWND_TOPMOST, 0, 0, 0, 0,
                NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE | NativeMethods.SWP_SHOWWINDOW);
        }

        if (_overlayHandles.Count > 0)
        {
            NativeMethods.SetForegroundWindow(_overlayHandles[0]);
        }
    }

    public void Dispose()
    {
        StopForegroundWatchdog();
        RestoreTaskManager();
        _keyboardHook.Dispose();
        GC.SuppressFinalize(this);
    }
}
