using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using NinetyAgent.Client.Core;
using NinetyAgent.Client.Interop;
using NinetyAgent.Client.Networking;

namespace NinetyAgent.Client.Lockdown;

/// <summary>
/// One instance of this window is created per physical monitor (see
/// <see cref="SystemLockdownManager.EnumerateMonitors"/>). Only the primary monitor's instance
/// shows the full status panel; secondary monitors show a plain covering surface.
/// </summary>
public partial class KioskOverlayWindow : Window
{
    private readonly MonitorBounds _bounds;
    private readonly bool _showStatusPanel;

    // --- Low-Level Keyboard Hook Fields ---
    private static nint _hookId = 0;
    private static LowLevelKeyboardProc? _proc;

    public KioskOverlayWindow(MonitorBounds bounds, bool showStatusPanel)
    {
        _bounds = bounds;
        _showStatusPanel = showStatusPanel;
        InitializeComponent();

        Unloaded += OnUnloaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        WriteDebugLog($"[KioskOverlayWindow.OnLoaded] START: bounds=({_bounds.Left},{_bounds.Top}) size=({_bounds.Width}x{_bounds.Height}) isPrimary={_showStatusPanel}");

        try
        {
            var helper = new WindowInteropHelper(this);
            var hwnd = helper.EnsureHandle();

            WriteDebugLog($"[KioskOverlayWindow.OnLoaded] HWND created: {hwnd:X8}");

            // Position window topmost covering screen bounds
            NativeMethods.SetWindowPos(hwnd, NativeMethods.HWND_TOPMOST,
                _bounds.Left, _bounds.Top, _bounds.Width, _bounds.Height,
                NativeMethods.SWP_SHOWWINDOW | NativeMethods.SWP_NOACTIVATE);

            WriteDebugLog("[KioskOverlayWindow.OnLoaded] SetWindowPos called");

            this.Show();
            this.Activate();
            this.Topmost = true;

            WriteDebugLog("[KioskOverlayWindow.OnLoaded] Window shown and topmost set");

            if (!_showStatusPanel)
            {
                HintText.Visibility = Visibility.Collapsed;
                BalanceText.Visibility = Visibility.Collapsed;
                ConnectionDot.Visibility = Visibility.Collapsed;
                ConnectionStatusText.Visibility = Visibility.Collapsed;
                StatusMessageText.Text = string.Empty;
                WriteDebugLog("[KioskOverlayWindow.OnLoaded] Secondary monitor mode: UI elements collapsed");
            }

            // Install low-level keyboard hook to block Windows Key & system shortcuts
            InstallKeyboardHook();

            WriteDebugLog("[KioskOverlayWindow.OnLoaded] SUCCESS");
        }
        catch (Exception ex)
        {
            WriteDebugLog($"[KioskOverlayWindow.OnLoaded] EXCEPTION: {ex}");
            throw;
        }
    }

    private void OnUnloaded(object sender, RoutedEventArgs e)
    {
        UninstallKeyboardHook();
    }

    public nint Handle => new WindowInteropHelper(this).Handle;

    private static void WriteDebugLog(string message)
    {
        try
        {
            var logDir = @"C:\ProgramData\NinetyAgent\logs";
            Directory.CreateDirectory(logDir);
            var logFile = Path.Combine(logDir, "ui_debug.log");
            File.AppendAllText(logFile, $"{DateTime.Now:O} {message}{Environment.NewLine}");
        }
        catch { }
        Console.WriteLine(message);
    }

    public void Render(AgentState state, int remainingSeconds, decimal? walletBalance, ConnectionState connectionState)
    {
        if (!_showStatusPanel) return;

        switch (state)
        {
            case AgentState.DISCOVERING:
                StatusMessageText.Text = "STARTING UP";
                HintText.Text = "Looking for the venue server on the local network...";
                SessionTimerText.Visibility = Visibility.Collapsed;
                break;

            case AgentState.LOCKED_IDLE:
                StatusMessageText.Text = "STATION LOCKED";
                HintText.Text = "See venue staff to start or extend your session.";
                SessionTimerText.Visibility = Visibility.Collapsed;
                break;

            case AgentState.PAUSED:
                StatusMessageText.Text = "SESSION PAUSED";
                HintText.Text = "Your remaining time is safe. Staff will resume shortly.";
                SessionTimerText.Text = FormatCountdown(remainingSeconds);
                SessionTimerText.Visibility = Visibility.Visible;
                break;

            case AgentState.DISCONNECTED_LOCK:
                StatusMessageText.Text = "RECONNECTING...";
                HintText.Text = "Network link to the venue server was lost. Your remaining time is preserved locally.";
                SessionTimerText.Text = FormatCountdown(remainingSeconds);
                SessionTimerText.Visibility = Visibility.Visible;
                break;

            case AgentState.ACTIVE_SESSION:
                StatusMessageText.Text = "SESSION ACTIVE";
                HintText.Text = "Enjoy your session!";
                SessionTimerText.Text = FormatCountdown(remainingSeconds);
                SessionTimerText.Visibility = Visibility.Visible;
                break;
        }

        BalanceText.Text = walletBalance is { } balance ? $"Balance: {balance:0.00} TND" : "Balance: --";

        (ConnectionDot.Fill, ConnectionStatusText.Text) = connectionState switch
        {
            ConnectionState.Connected => (new SolidColorBrush(Color.FromRgb(0x3F, 0xB9, 0x50)), "Connected"),
            ConnectionState.Connecting => (new SolidColorBrush(Color.FromRgb(0xE3, 0xB3, 0x41)), "Connecting..."),
            ConnectionState.Reconnecting => (new SolidColorBrush(Color.FromRgb(0xE3, 0xB3, 0x41)), "Reconnecting..."),
            ConnectionState.Disconnected => (new SolidColorBrush(Color.FromRgb(0xF8, 0x51, 0x49)), "Offline (cached lock active)"),
            _ => (ConnectionDot.Fill, ConnectionStatusText.Text)
        };
    }

    private static string FormatCountdown(int totalSeconds)
    {
        if (totalSeconds == int.MaxValue) return "∞";
        var ts = TimeSpan.FromSeconds(Math.Max(0, totalSeconds));
        return ts.TotalHours >= 1 ? ts.ToString(@"hh\:mm\:ss") : ts.ToString(@"mm\:ss");
    }

    // =========================================================================
    // Win32 Low-Level Keyboard Hook (Blocks WinKey, Alt+Tab, Ctrl+Esc, etc.)
    // =========================================================================

    private static void InstallKeyboardHook()
    {
        if (_hookId != 0) return;

        _proc = HookCallback;
        using var curProcess = Process.GetCurrentProcess();
        using var curModule = curProcess.MainModule;

        if (curModule != null)
        {
            _hookId = SetWindowsHookEx(WH_KEYBOARD_LL, _proc, GetModuleHandle(curModule.ModuleName), 0);
            WriteDebugLog($"[KeyboardHook] Hook installed successfully. ID: {_hookId:X8}");
        }
    }

    private static void UninstallKeyboardHook()
    {
        if (_hookId != 0)
        {
            UnhookWindowsHookEx(_hookId);
            _hookId = 0;
            _proc = null;
            WriteDebugLog("[KeyboardHook] Hook removed.");
        }
    }

    private static nint HookCallback(int nCode, nint wParam, nint lParam)
    {
        if (nCode >= 0)
        {
            var kbStruct = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
            var vkCode = kbStruct.vkCode;

            bool isLWin = vkCode == VK_LWIN;
            bool isRWin = vkCode == VK_RWIN;
            bool isAltTab = vkCode == VK_TAB && (kbStruct.flags & LLKHF_ALTDOWN) != 0;
            bool isCtrlEsc = vkCode == VK_ESCAPE && (GetKeyState(VK_CONTROL) & 0x8000) != 0;

            if (isLWin || isRWin || isAltTab || isCtrlEsc)
            {
                return 1; // Bloque l'action système
            }
        }

        return CallNextHookEx(_hookId, nCode, wParam, lParam);
    }

    private const int WH_KEYBOARD_LL = 13;
    private const uint VK_LWIN = 0x5B;
    private const uint VK_RWIN = 0x5C;
    private const uint VK_TAB = 0x09;
    private const uint VK_ESCAPE = 0x1B;
    private const int VK_CONTROL = 0x11;
    private const uint LLKHF_ALTDOWN = 0x20;

    private delegate nint LowLevelKeyboardProc(int nCode, nint wParam, nint lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct KBDLLHOOKSTRUCT
    {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public nint dwExtraInfo;
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern nint SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, nint hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(nint hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern nint CallNextHookEx(nint hhk, int nCode, nint wParam, nint lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern nint GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern short GetKeyState(int nVirtKey);
}