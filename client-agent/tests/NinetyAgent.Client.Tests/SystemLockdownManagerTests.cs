using System;
using Microsoft.Win32;
using Moq;
using NinetyAgent.Client.Core;
using NinetyAgent.Client.Lockdown;
using Xunit;

namespace NinetyAgent.Client.Tests;

public class SystemLockdownManagerTests
{
    private const string TestKeyPath = @"Software\Microsoft\Windows\CurrentVersion\Policies\System";
    private const string ValueName = "DisableTaskMgr";

    [Fact]
    public void Constructor_CreatesKeyboardHook()
    {
        var logMock = new Mock<ILogSink>();
        var manager = new SystemLockdownManager(logMock.Object);

        Assert.NotNull(manager.GetType().GetField("_keyboardHook", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)?.GetValue(manager));
    }

    [Fact]
    public void Constructor_InitializesWithSuppressionDisabled()
    {
        var logMock = new Mock<ILogSink>();
        var manager = new SystemLockdownManager(logMock.Object);

        manager.Initialize();

        logMock.Verify(l => l.Info(It.Is<string>(s => s.Contains("LowLevelKeyboardHook installed"))), Times.Once);
    }

    [Fact]
    public void EngageLock_SetsSuppressionEnabled()
    {
        var logMock = new Mock<ILogSink>();
        var manager = new SystemLockdownManager(logMock.Object);
        manager.Initialize();

        manager.EngageLock();

        var hook = (LowLevelKeyboardHook)manager.GetType().GetField("_keyboardHook", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(manager)!;
        Assert.True(hook.SuppressionEnabled);
    }

    [Fact]
    public void ReleaseLock_SetsSuppressionDisabled()
    {
        var logMock = new Mock<ILogSink>();
        var manager = new SystemLockdownManager(logMock.Object);
        manager.Initialize();
        manager.EngageLock();

        manager.ReleaseLock();

        var hook = (LowLevelKeyboardHook)manager.GetType().GetField("_keyboardHook", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!.GetValue(manager)!;
        Assert.False(hook.SuppressionEnabled);
    }

    [Fact]
    public void EngageLock_SetsDisableTaskMgrRegistry()
    {
        var logMock = new Mock<ILogSink>();
        var manager = new SystemLockdownManager(logMock.Object);
        manager.Initialize();

        ClearDisableTaskMgr();

        manager.EngageLock();

        using var key = Registry.CurrentUser.OpenSubKey(TestKeyPath, false);
        var value = key?.GetValue(ValueName);
        Assert.Equal(1, value);
    }

    [Fact]
    public void ReleaseLock_ClearsDisableTaskMgrRegistry()
    {
        var logMock = new Mock<ILogSink>();
        var manager = new SystemLockdownManager(logMock.Object);
        manager.Initialize();
        manager.EngageLock();

        manager.ReleaseLock();

        using var key = Registry.CurrentUser.OpenSubKey(TestKeyPath, false);
        var value = key?.GetValue(ValueName);
        Assert.Null(value);
    }

    [Fact]
    public void Dispose_RestoresTaskManager()
    {
        var logMock = new Mock<ILogSink>();
        var manager = new SystemLockdownManager(logMock.Object);
        manager.Initialize();
        manager.EngageLock();

        manager.Dispose();

        using var key = Registry.CurrentUser.OpenSubKey(TestKeyPath, false);
        var value = key?.GetValue(ValueName);
        Assert.Null(value);
    }

    [Fact]
    public void Dispose_CalledTwice_DoesNotThrow()
    {
        var logMock = new Mock<ILogSink>();
        var manager = new SystemLockdownManager(logMock.Object);
        manager.Initialize();

        var ex = Record.Exception(() => { manager.Dispose(); manager.Dispose(); });
        Assert.Null(ex);
    }

    [Fact]
    public void EngageLock_WithoutPriorDisable_DoesNotSetRegistry()
    {
        var logMock = new Mock<ILogSink>();
        var manager = new SystemLockdownManager(logMock.Object);
        manager.Initialize();

        ClearDisableTaskMgr();
        using var existingKey = Registry.CurrentUser.CreateSubKey(TestKeyPath, writable: true);
        existingKey?.SetValue(ValueName, 1, RegistryValueKind.DWord);

        manager.EngageLock();

        using var key = Registry.CurrentUser.OpenSubKey(TestKeyPath, false);
        var value = key?.GetValue(ValueName);
        Assert.Equal(1, value);
    }

    [Fact]
    public void Initialize_KeyboardHookInstalled()
    {
        var logMock = new Mock<ILogSink>();
        var manager = new SystemLockdownManager(logMock.Object);

        manager.Initialize();

        logMock.Verify(l => l.Info(It.Is<string>(s => s.Contains("installed"))), Times.Once);
    }

    [Fact]
    public void Dispose_DisposesKeyboardHook()
    {
        var logMock = new Mock<ILogSink>();
        var manager = new SystemLockdownManager(logMock.Object);
        manager.Initialize();

        var ex = Record.Exception(() => manager.Dispose());
        Assert.Null(ex);
    }

    private static void ClearDisableTaskMgr()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(TestKeyPath, writable: true);
            key?.DeleteValue(ValueName, throwOnMissingValue: false);
        }
        catch { }
    }
}
