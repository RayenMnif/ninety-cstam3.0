using System;
using System.Runtime.InteropServices;

namespace NinetyAgent.Client.Interop;

public static class NativeMethods
{
    // ------------------------------------------------------------------
    // Device Notifications (USB / HID)
    // ------------------------------------------------------------------
    public const int WM_DEVICECHANGE = 0x0219;
    public const int DBT_DEVICEREMOVECOMPLETE = 0x8004;
    public const int DBT_DEVTYP_DEVICEINTERFACE = 5;
    public const int DEVICE_NOTIFY_WINDOW_HANDLE = 0x00000000;

    public static readonly Guid GUID_DEVINTERFACE_HID = new("4D1E55B2-F16F-11CF-88CB-001111000030");
    public static readonly Guid GUID_DEVINTERFACE_USB_DEVICE = new("A5DCBF10-6530-11D2-901F-00C04FB951ED");

    [StructLayout(LayoutKind.Sequential)]
    public struct DEV_BROADCAST_HDR
    {
        public int dbch_size;
        public int dbch_devicetype;
        public int dbch_reserved;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct DEV_BROADCAST_DEVICEINTERFACE_FILTER
    {
        public int dbcc_size;
        public int dbcc_devicetype;
        public int dbcc_reserved;
        public Guid dbcc_classguid;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct DEV_BROADCAST_DEVICEINTERFACE
    {
        public int dbcc_size;
        public int dbcc_devicetype;
        public int dbcc_reserved;
        public Guid dbcc_classguid;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 255)]
        public string dbcc_name;
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern nint RegisterDeviceNotification(nint hRecipient, nint NotificationFilter, uint Flags);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UnregisterDeviceNotification(nint Handle);

    // ------------------------------------------------------------------
    // Monitor / Window Helpers & Lockdown Mechanics
    // ------------------------------------------------------------------
    public const uint SWP_NOSIZE = 0x0001;
    public const uint SWP_NOMOVE = 0x0002;
    public const uint SWP_NOACTIVATE = 0x0010;
    public const uint SWP_SHOWWINDOW = 0x0040;
    public static readonly nint HWND_TOPMOST = new(-1);

    public const uint EVENT_SYSTEM_FOREGROUND = 0x0003;
    public const uint WINEVENT_OUTOFCONTEXT = 0x0000;
    public const uint SPI_SETSTICKYKEYS = 0x003B;

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;

        public int Width => Right - Left;
        public int Height => Bottom - Top;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct MONITORINFOEX
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string szDevice;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct STICKYKEYS
    {
        public int cbSize;
        public int dwFlags;
    }

    public delegate bool MonitorEnumDelegate(nint hMonitor, nint hdcMonitor, ref RECT lprcMonitor, nint dwData);
    public delegate void WinEventDelegate(nint hWinEventHook, uint eventType, nint hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool EnumDisplayMonitors(nint hdc, nint lprcClip, MonitorEnumDelegate lpfnEnum, nint dwData);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetMonitorInfo(nint hMonitor, ref MONITORINFOEX lpmi);

    [DllImport("user32.dll")]
    public static extern nint GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetForegroundWindow(nint hWnd);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(nint hWnd, nint hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    public static extern nint SetWinEventHook(uint eventMin, uint eventMax, nint hmodWinEventProc, WinEventDelegate lpfnWinEventProc, uint idProcess, uint idThread, uint dwFlags);

    [DllImport("user32.dll")]
    public static extern bool UnhookWinEvent(nint hWinEventHook);

    [DllImport("user32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(nint hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(nint hWnd);

    [DllImport("user32.dll", EntryPoint = "SystemParametersInfo", SetLastError = true)]
    public static extern bool SystemParametersInfo(uint uiAction, int uiParam, ref STICKYKEYS pvParam, uint fWinIni);

    // ------------------------------------------------------------------
    // Windows Terminal Services (WTS) Session Management for Watchdog
    // ------------------------------------------------------------------
    public const uint WTS_CURRENT_SERVER_HANDLE = 0;

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct WTS_SESSION_INFO
    {
        public uint SessionID;
        [MarshalAs(UnmanagedType.LPStr)]
        public string pWinStationName;
        public WTS_CONNECTSTATE_CLASS State;
    }

    public enum WTS_CONNECTSTATE_CLASS
    {
        WTSActive = 0,
        WTSConnected = 1,
        WTSConnectQuery = 2,
        WTSShadow = 3,
        WTSDisconnected = 4,
        WTSIdle = 5,
        WTSListen = 6,
        WTSReset = 7,
        WTSDown = 8,
        WTSInit = 9
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION
    {
        public nint hProcess;
        public nint hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct STARTUPINFO
    {
        public uint cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public uint dwX;
        public uint dwY;
        public uint dwXSize;
        public uint dwYSize;
        public uint dwXCountChars;
        public uint dwYCountChars;
        public uint dwFillAttribute;
        public uint dwFlags;
        public ushort wShowWindow;
        public ushort cbReserved2;
        public nint lpReserved2;
        public nint hStdInput;
        public nint hStdOutput;
        public nint hStdError;
    }

    [DllImport("wtsapi32.dll", SetLastError = true)]
    public static extern bool WTSEnumerateSessions(
        nint hServer, uint Reserved, uint Version,
        out nint ppSessionInfo, out uint pCount);

    [DllImport("wtsapi32.dll", SetLastError = true)]
    public static extern void WTSFreeMemory(nint pMemory);

    [DllImport("wtsapi32.dll", SetLastError = true)]
    public static extern bool WTSQueryUserToken(uint SessionId, out nint phToken);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern bool CreateProcessAsUser(
        nint hToken,
        string lpApplicationName,
        string lpCommandLine,
        nint lpProcessAttributes,
        nint lpThreadAttributes,
        bool bInheritHandles,
        uint dwCreationFlags,
        nint lpEnvironment,
        string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo,
        out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(nint hObject);
}