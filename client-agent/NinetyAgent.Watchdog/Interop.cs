using System;
using System.Runtime.InteropServices;

namespace NinetyAgent.Watchdog;

public static class NativeMethods
{
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
