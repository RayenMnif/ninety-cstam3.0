using Moq;
using NinetyAgent.Client.Core;
using NinetyAgent.Client.Lockdown;
using Xunit;

namespace NinetyAgent.Client.Tests;

public class LowLevelKeyboardHookTests
{
    [Fact]
    public void Constructor_SuppressionEnabled_DefaultsToFalse()
    {
        var logMock = new Mock<ILogSink>();
        var hook = new LowLevelKeyboardHook(logMock.Object);

        Assert.False(hook.SuppressionEnabled);
    }

    [Fact]
    public void SuppressionEnabled_CanBeSetToTrue()
    {
        var logMock = new Mock<ILogSink>();
        var hook = new LowLevelKeyboardHook(logMock.Object);

        hook.SuppressionEnabled = true;

        Assert.True(hook.SuppressionEnabled);
    }

    [Fact]
    public void SuppressionEnabled_CanBeSetToFalse()
    {
        var logMock = new Mock<ILogSink>();
        var hook = new LowLevelKeyboardHook(logMock.Object);
        hook.SuppressionEnabled = true;

        hook.SuppressionEnabled = false;

        Assert.False(hook.SuppressionEnabled);
    }

    [Fact]
    public void Install_CallsLogInfo()
    {
        var logMock = new Mock<ILogSink>();
        var hook = new LowLevelKeyboardHook(logMock.Object);

        hook.Install();

        logMock.Verify(l => l.Info(It.Is<string>(s => s.Contains("LowLevelKeyboardHook installed"))), Times.Once);
    }

    [Fact]
    public void Dispose_DoesNotThrow()
    {
        var logMock = new Mock<ILogSink>();
        var hook = new LowLevelKeyboardHook(logMock.Object);

        var ex = Record.Exception(() => hook.Dispose());
        Assert.Null(ex);
    }
}
