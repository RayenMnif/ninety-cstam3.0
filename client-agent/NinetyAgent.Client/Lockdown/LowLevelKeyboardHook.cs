using System;
using NinetyAgent.Client.Core;

namespace NinetyAgent.Client.Lockdown;

/// <summary>
/// Minimal implementation of the keyboard hook used by SystemLockdownManager.
/// This is intentionally lightweight to fix build errors; it can be expanded later with
/// the real low-level keyboard hook implementation.
/// </summary>
public sealed class LowLevelKeyboardHook : IDisposable
{
    private readonly ILogSink _log;

    public event Action<string>? BypassAttemptBlocked;

    public bool SuppressionEnabled { get; set; }

    public LowLevelKeyboardHook(ILogSink log)
    {
        _log = log;
    }

    public void Install()
    {
        // No-op for now: a real implementation would call SetWindowsHookEx.
        _log.Info("[Lockdown] LowLevelKeyboardHook installed (noop).");
    }

    public void Dispose()
    {
        // Cleanup if a real hook was installed.
    }
}
