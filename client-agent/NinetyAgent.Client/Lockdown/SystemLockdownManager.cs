using Microsoft.Win32;
using NinetyAgent.Client.Core;
using NinetyAgent.Client.Interop;
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Media; // Required for WPF MediaPlayer audio engine
using System.Windows.Threading;
namespace NinetyAgent.Client.Lockdown;

public sealed record MonitorBounds(int Left, int Top, int Width, int Height, bool IsPrimary);

public sealed class SystemLockdownManager : IDisposable
{
    private readonly ILogSink _log;
    private readonly LowLevelKeyboardHook _keyboardHook;

    private readonly List<nint> _overlayHandles = new();
    private readonly List<Window> _overlayWindows = new();

    private Thread? _watchdogThread;
    private CancellationTokenSource? _watchdogCts;
    private nint _winEventHook = nint.Zero;
    private NativeMethods.WinEventDelegate? _winEventDelegate;

    private MediaPlayer? _mediaPlayer; // Lecteur audio
    private bool _policiesAppliedByUs;
    private bool _isLocked;

    public event Action<string>? BypassAttemptBlocked;

    public SystemLockdownManager(ILogSink log)
    {
        _log = log;
        _keyboardHook = new LowLevelKeyboardHook(log);
        _keyboardHook.BypassAttemptBlocked += desc => BypassAttemptBlocked?.Invoke(desc);
    }

    public void Initialize()
    {
        _keyboardHook.Install();
    }

    public void EngageLock()
    {
        if (_isLocked) return;
        _isLocked = true;

        _keyboardHook.SuppressionEnabled = true;
        ApplySecurityPolicies();
        DisableStickyKeys();

        // 1. Démarrer la sonnerie / alerte audio
        StartLockAudio();

        // Abonnement aux changements d'affichage (multi-écrans)
        SystemEvents.DisplaySettingsChanged += OnDisplaySettingsChanged;

        _log.Info("[Lockdown] Station locked with audio alert, policy hooks, and multi-monitor support.");

        try
        {
            RefreshOverlaysOnUIThread();
            StartWinEventHook();
            StartHighPriorityWatchdog();
        }
        catch (Exception ex)
        {
            _log.Error("[Lockdown] Error during EngageLock execution.", ex);
        }
    }

    public void ReleaseLock()
    {
        if (!_isLocked) return;
        _isLocked = false;

        _keyboardHook.SuppressionEnabled = false;
        SystemEvents.DisplaySettingsChanged -= OnDisplaySettingsChanged;

        // 2. Stopper la lecture audio
        StopLockAudio();

        StopWinEventHook();
        StopHighPriorityWatchdog();
        RestoreSecurityPolicies();

        CloseAllOverlays();
    }

    // ------------------------------------------------------------------
    // Audio Management Methods
    // ------------------------------------------------------------------

    // Replace: private SoundPlayer? _audioPlayer;

    private void StartLockAudio()
    {
        try
        {
            string audioPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Assets", "lock_alarm.wav");

            if (File.Exists(audioPath))
            {
                // Ensure UI Thread execution for WPF MediaPlayer
                Application.Current?.Dispatcher.Invoke(() =>
                {
                    _mediaPlayer = new System.Windows.Media.MediaPlayer();
                    _mediaPlayer.Open(new Uri(audioPath));

                    // Loop playback automatically when finished
                    _mediaPlayer.MediaEnded += (s, e) =>
                    {
                        _mediaPlayer.Position = TimeSpan.Zero;
                        _mediaPlayer.Play();
                    };

                    _mediaPlayer.Play();
                });

                _log.Info($"[Lockdown] Audio alert started from {audioPath}");
            }
            else
            {
                System.Media.SystemSounds.Exclamation.Play();
                _log.Warn($"[Lockdown] Audio file not found at {audioPath}. Played default system sound.");
            }
        }
        catch (Exception ex)
        {
            _log.Error("[Lockdown] Failed to start lock audio playback.", ex);
        }
    }

    private void StopLockAudio()
    {
        try
        {
            if (_mediaPlayer != null)
            {
                Application.Current?.Dispatcher.Invoke(() =>
                {
                    _mediaPlayer.Stop();
                    _mediaPlayer.Close();
                    _mediaPlayer = null;
                });
                _log.Info("[Lockdown] Audio alert stopped.");
            }
        }
        catch (Exception ex)
        {
            _log.Error("[Lockdown] Error stopping audio playback.", ex);
        }
    }

    private async void OnDisplaySettingsChanged(object? sender, EventArgs e)
    {
        if (!_isLocked) return;
        _log.Info("[Lockdown] Display settings changed. Refreshing overlays...");
        await System.Threading.Tasks.Task.Delay(500);
        RefreshOverlaysOnUIThread();
    }

    private void RefreshOverlaysOnUIThread()
    {
        if (Application.Current is null) return;

        Application.Current.Dispatcher.Invoke(() =>
        {
            CloseAllOverlaysUIThread();

            var monitors = EnumerateMonitors();
            foreach (var m in monitors)
            {
                try
                {
                    var win = new KioskOverlayWindow(m, m.IsPrimary);
                    win.Show();
                    win.Activate();
                    win.Topmost = true;

                    _overlayWindows.Add(win);
                    RegisterOverlayHandle(win.Handle);
                }
                catch (Exception ex)
                {
                    _log.Error($"[Lockdown] Failed to create overlay window.", ex);
                }
            }

            ForceForegroundOverlay();
        }, DispatcherPriority.Send);
    }

    private void CloseAllOverlays()
    {
        try
        {
            Application.Current?.Dispatcher.Invoke(CloseAllOverlaysUIThread);
        }
        catch (Exception ex)
        {
            _log.Error("[Lockdown] Error during overlay cleanup.", ex);
        }
    }

    private void CloseAllOverlaysUIThread()
    {
        foreach (var w in _overlayWindows)
        {
            try { w.Close(); } catch { }
        }
        _overlayWindows.Clear();
        _overlayHandles.Clear();
    }

    public void RegisterOverlayHandle(nint hwnd)
    {
        if (!_overlayHandles.Contains(hwnd))
        {
            _overlayHandles.Add(hwnd);
        }
    }

    private void StartWinEventHook()
    {
        _winEventDelegate = WinEventProc;
        _winEventHook = NativeMethods.SetWinEventHook(
            NativeMethods.EVENT_SYSTEM_FOREGROUND,
            NativeMethods.EVENT_SYSTEM_FOREGROUND,
            nint.Zero,
            _winEventDelegate,
            0, 0,
            NativeMethods.WINEVENT_OUTOFCONTEXT);
    }

    private void StopWinEventHook()
    {
        if (_winEventHook != nint.Zero)
        {
            NativeMethods.UnhookWinEvent(_winEventHook);
            _winEventHook = nint.Zero;
        }
    }

    private void WinEventProc(nint hWinEventHook, uint eventType, nint hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime)
    {
        if (!_isLocked) return;
        if (!_overlayHandles.Contains(hwnd))
        {
            ForceForegroundOverlay();
        }
    }

    private void StartHighPriorityWatchdog()
    {
        _watchdogCts = new CancellationTokenSource();
        var token = _watchdogCts.Token;

        _watchdogThread = new Thread(() =>
        {
            while (!token.IsCancellationRequested)
            {
                try
                {
                    if (_isLocked)
                    {
                        var fg = NativeMethods.GetForegroundWindow();
                        if (!_overlayHandles.Contains(fg))
                        {
                            ForceForegroundOverlay();
                        }
                    }
                }
                catch { }

                Thread.Sleep(30);
            }
        })
        {
            IsBackground = true,
            Priority = ThreadPriority.Highest,
            Name = "KioskLockdownWatchdog"
        };

        _watchdogThread.Start();
    }

    private void StopHighPriorityWatchdog()
    {
        _watchdogCts?.Cancel();
        _watchdogThread = null;
    }

    private void ForceForegroundOverlay()
    {
        if (_overlayHandles.Count == 0) return;

        nint primaryHwnd = _overlayHandles[0];
        nint currentFg = NativeMethods.GetForegroundWindow();

        uint currentThread = NativeMethods.GetCurrentThreadId();
        uint fgThread = NativeMethods.GetWindowThreadProcessId(currentFg, out _);

        foreach (var handle in _overlayHandles)
        {
            NativeMethods.SetWindowPos(handle, NativeMethods.HWND_TOPMOST, 0, 0, 0, 0,
                NativeMethods.SWP_NOMOVE | NativeMethods.SWP_NOSIZE | NativeMethods.SWP_SHOWWINDOW | NativeMethods.SWP_NOACTIVATE);
        }

        if (currentThread != fgThread)
        {
            NativeMethods.AttachThreadInput(currentThread, fgThread, true);
            NativeMethods.SetForegroundWindow(primaryHwnd);
            NativeMethods.BringWindowToTop(primaryHwnd);
            NativeMethods.AttachThreadInput(currentThread, fgThread, false);
        }
        else
        {
            NativeMethods.SetForegroundWindow(primaryHwnd);
            NativeMethods.BringWindowToTop(primaryHwnd);
        }
    }

    private const string SystemPoliciesPath = @"Software\Microsoft\Windows\CurrentVersion\Policies\System";
    private const string ExplorerPoliciesPath = @"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer";

    private void ApplySecurityPolicies()
    {
        try
        {
            using var sysKey = Registry.CurrentUser.CreateSubKey(SystemPoliciesPath, writable: true);
            sysKey?.SetValue("DisableTaskMgr", 1, RegistryValueKind.DWord);
            sysKey?.SetValue("DisableLockWorkstation", 1, RegistryValueKind.DWord);
            sysKey?.SetValue("DisableChangePassword", 1, RegistryValueKind.DWord);

            using var expKey = Registry.CurrentUser.CreateSubKey(ExplorerPoliciesPath, writable: true);
            expKey?.SetValue("NoLogoff", 1, RegistryValueKind.DWord);
            expKey?.SetValue("NoClose", 1, RegistryValueKind.DWord);
            expKey?.SetValue("NoRun", 1, RegistryValueKind.DWord);

            _policiesAppliedByUs = true;
        }
        catch (Exception ex)
        {
            _log.Error("[Lockdown] Could not write security registry policies.", ex);
        }
    }

    private void RestoreSecurityPolicies()
    {
        if (!_policiesAppliedByUs) return;
        try
        {
            using var sysKey = Registry.CurrentUser.OpenSubKey(SystemPoliciesPath, writable: true);
            sysKey?.DeleteValue("DisableTaskMgr", false);
            sysKey?.DeleteValue("DisableLockWorkstation", false);
            sysKey?.DeleteValue("DisableChangePassword", false);

            using var expKey = Registry.CurrentUser.OpenSubKey(ExplorerPoliciesPath, writable: true);
            expKey?.DeleteValue("NoLogoff", false);
            expKey?.DeleteValue("NoClose", false);
            expKey?.DeleteValue("NoRun", false);

            _policiesAppliedByUs = false;
        }
        catch (Exception ex)
        {
            _log.Error("[Lockdown] Could not clear security registry policies.", ex);
        }
    }

    private void DisableStickyKeys()
    {
        try
        {
            NativeMethods.STICKYKEYS sk = new NativeMethods.STICKYKEYS
            {
                cbSize = Marshal.SizeOf<NativeMethods.STICKYKEYS>(),
                dwFlags = 0
            };
            NativeMethods.SystemParametersInfo(NativeMethods.SPI_SETSTICKYKEYS, sk.cbSize, ref sk, 0);
        }
        catch { }
    }

    public static IReadOnlyList<MonitorBounds> EnumerateMonitors()
    {
        var results = new List<MonitorBounds>();
        bool Callback(nint hMonitor, nint hdc, ref NativeMethods.RECT rect, nint data)
        {
            var info = new NativeMethods.MONITORINFOEX
            {
                cbSize = Marshal.SizeOf<NativeMethods.MONITORINFOEX>()
            };
            if (NativeMethods.GetMonitorInfo(hMonitor, ref info))
            {
                const uint MONITORINFOF_PRIMARY = 0x1;
                results.Add(new MonitorBounds(
                    info.rcMonitor.Left, info.rcMonitor.Top,
                    info.rcMonitor.Width, info.rcMonitor.Height,
                    (info.dwFlags & MONITORINFOF_PRIMARY) != 0));
            }
            return true;
        }
        NativeMethods.EnumDisplayMonitors(0, 0, Callback, 0);
        return results;
    }

    public void Dispose()
    {
        ReleaseLock();
        _keyboardHook.Dispose();
        GC.SuppressFinalize(this);
    }
}