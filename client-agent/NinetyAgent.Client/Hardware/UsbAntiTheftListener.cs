using System;
using System.Runtime.InteropServices;
using System.Windows.Interop;
using NinetyAgent.Client.Core;
using NinetyAgent.Client.Interop;
using NinetyAgent.Client.Networking;

namespace NinetyAgent.Client.Hardware;

public sealed class UsbAntiTheftListener : IDisposable
{
    private readonly ILogSink _log;
    private HwndSource? _hwndSource;
    private nint _hidNotificationHandle;
    private nint _usbNotificationHandle;

    public event Action<string?>? PeripheralDisconnected;

    public UsbAntiTheftListener(ILogSink log)
    {
        _log = log;
    }

    public void Attach(nint hwnd)
    {
        _hwndSource = HwndSource.FromHwnd(hwnd)
            ?? throw new InvalidOperationException("Could not obtain an HwndSource for the given handle.");
        _hwndSource.AddHook(WndProc);

        _hidNotificationHandle = RegisterForInterfaceClass(hwnd, NativeMethods.GUID_DEVINTERFACE_HID);
        _usbNotificationHandle = RegisterForInterfaceClass(hwnd, NativeMethods.GUID_DEVINTERFACE_USB_DEVICE);

        _log.Info("[UsbAntiTheft] Registered for HID + USB device-interface notifications.");
    }

    private nint RegisterForInterfaceClass(nint hwnd, Guid interfaceClassGuid)
    {
        var filter = new NativeMethods.DEV_BROADCAST_DEVICEINTERFACE_FILTER
        {
            dbcc_size = Marshal.SizeOf<NativeMethods.DEV_BROADCAST_DEVICEINTERFACE_FILTER>(),
            dbcc_devicetype = NativeMethods.DBT_DEVTYP_DEVICEINTERFACE,
            dbcc_reserved = 0,
            dbcc_classguid = interfaceClassGuid
        };

        var buffer = Marshal.AllocHGlobal(filter.dbcc_size);
        try
        {
            Marshal.StructureToPtr(filter, buffer, false);
            var handle = NativeMethods.RegisterDeviceNotification(hwnd, buffer, NativeMethods.DEVICE_NOTIFY_WINDOW_HANDLE);
            if (handle == 0)
            {
                _log.Warn($"[UsbAntiTheft] RegisterDeviceNotification failed for {interfaceClassGuid} " +
                          $"(Win32 error {Marshal.GetLastWin32Error()}). Falling back to broadcast-only detection.");
            }
            return handle;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private nint WndProc(nint hwnd, int msg, nint wParam, nint lParam, ref bool handled)
    {
        if (msg != NativeMethods.WM_DEVICECHANGE) return nint.Zero;

        var eventType = (int)wParam;
        if (eventType != NativeMethods.DBT_DEVICEREMOVECOMPLETE) return nint.Zero;

        if (lParam == nint.Zero) return nint.Zero;

        var header = Marshal.PtrToStructure<NativeMethods.DEV_BROADCAST_HDR>(lParam);
        if (header.dbch_devicetype != NativeMethods.DBT_DEVTYP_DEVICEINTERFACE) return nint.Zero;

        string? deviceName = null;
        try
        {
            var iface = Marshal.PtrToStructure<NativeMethods.DEV_BROADCAST_DEVICEINTERFACE>(lParam);
            deviceName = FriendlyNameFromDevicePath(iface.dbcc_name);
        }
        catch (Exception ex)
        {
            _log.Warn($"[UsbAntiTheft] Could not parse device-interface payload: {ex.Message}");
        }

        _log.Info($"[UsbAntiTheft] Peripheral disconnected: {deviceName ?? "(unknown device)"}");
        PeripheralDisconnected?.Invoke(deviceName);

        handled = true;
        return nint.Zero;
    }

    private static string FriendlyNameFromDevicePath(string devicePath)
    {
        var vidIndex = devicePath.IndexOf("VID_", StringComparison.OrdinalIgnoreCase);
        var pidIndex = devicePath.IndexOf("PID_", StringComparison.OrdinalIgnoreCase);
        if (vidIndex < 0 || pidIndex < 0) return devicePath;

        var vid = devicePath.Substring(vidIndex + 4, Math.Min(4, devicePath.Length - vidIndex - 4));
        var pid = devicePath.Substring(pidIndex + 4, Math.Min(4, devicePath.Length - pidIndex - 4));
        return $"USB Device (VID_{vid} PID_{pid})";
    }

    public void Dispose()
    {
        if (_hidNotificationHandle != 0) NativeMethods.UnregisterDeviceNotification(_hidNotificationHandle);
        if (_usbNotificationHandle != 0) NativeMethods.UnregisterDeviceNotification(_usbNotificationHandle);
        _hwndSource?.RemoveHook(WndProc);
        GC.SuppressFinalize(this);
    }
}