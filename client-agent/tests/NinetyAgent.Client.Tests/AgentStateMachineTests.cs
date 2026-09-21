using System;
using Moq;
using NinetyAgent.Client.Core;
using NinetyAgent.Client.Networking;
using Xunit;

namespace NinetyAgent.Client.Tests;

public class AgentStateMachineTests
{
    [Fact]
    public void InitialState_IsDiscovering()
    {
        var logMock = new Mock<ILogSink>();
        var machine = new AgentStateMachine(logMock.Object);
        Assert.Equal(AgentState.DISCOVERING, machine.Current);
    }

    [Fact]
    public void Fire_ValidTransition_UpdatesState()
    {
        var logMock = new Mock<ILogSink>();
        var machine = new AgentStateMachine(logMock.Object);

        bool fired = machine.Fire(AgentEvent.ServerDiscovered);

        Assert.True(fired);
        Assert.Equal(AgentState.LOCKED_IDLE, machine.Current);
    }

    [Fact]
    public void Fire_InvalidTransition_ReturnsFalse()
    {
        var logMock = new Mock<ILogSink>();
        var machine = new AgentStateMachine(logMock.Object);

        bool fired = machine.Fire(AgentEvent.CommandStart);

        Assert.False(fired);
        Assert.Equal(AgentState.DISCOVERING, machine.Current);
    }

    [Fact]
    public void ApplySessionCommand_Start_ChangesToActiveSession()
    {
        var logMock = new Mock<ILogSink>();
        var machine = new AgentStateMachine(logMock.Object);
        machine.Fire(AgentEvent.ServerDiscovered);

        var command = new SessionCommandPayload { Action = "START", SessionId = "SESS_001", DurationSeconds = 300 };
        machine.ApplySessionCommand(command);

        Assert.Equal(AgentState.ACTIVE_SESSION, machine.Current);
        Assert.Equal("SESS_001", machine.ActiveSessionId);
        Assert.Equal(300, machine.RemainingSeconds);
    }

    [Fact]
    public void ApplySessionCommand_Pause_ChangesToPaused()
    {
        var logMock = new Mock<ILogSink>();
        var machine = new AgentStateMachine(logMock.Object);
        machine.Fire(AgentEvent.ServerDiscovered);
        machine.ApplySessionCommand(new SessionCommandPayload { Action = "START", SessionId = "SESS_001", DurationSeconds = 300 });

        machine.ApplySessionCommand(new SessionCommandPayload { Action = "PAUSE" });

        Assert.Equal(AgentState.PAUSED, machine.Current);
    }

    [Fact]
    public void ApplySessionCommand_Unlock_ResetsRemainingSeconds()
    {
        var logMock = new Mock<ILogSink>();
        var machine = new AgentStateMachine(logMock.Object);
        machine.Fire(AgentEvent.ServerDiscovered);
        machine.ApplySessionCommand(new SessionCommandPayload { Action = "START", SessionId = "SESS_001", DurationSeconds = 300 });
        machine.ApplySessionCommand(new SessionCommandPayload { Action = "PAUSE" });

        machine.ApplySessionCommand(new SessionCommandPayload { Action = "UNLOCK", DurationSeconds = 600 });

        Assert.Equal(AgentState.ACTIVE_SESSION, machine.Current);
        Assert.Equal(600, machine.RemainingSeconds);
    }

    [Fact]
    public void TickOneSecond_DecrementsRemainingSeconds()
    {
        var logMock = new Mock<ILogSink>();
        var machine = new AgentStateMachine(logMock.Object);
        machine.Fire(AgentEvent.ServerDiscovered);
        machine.ApplySessionCommand(new SessionCommandPayload { Action = "START", SessionId = "SESS_001", DurationSeconds = 5 });

        for (int i = 0; i < 5; i++) machine.TickOneSecond();

        Assert.Equal(0, machine.RemainingSeconds);
    }

    [Fact]
    public void TickOneSecond_Expired_FiresTimerExpired()
    {
        var logMock = new Mock<ILogSink>();
        var machine = new AgentStateMachine(logMock.Object);
        machine.Fire(AgentEvent.ServerDiscovered);
        machine.ApplySessionCommand(new SessionCommandPayload { Action = "START", SessionId = "SESS_001", DurationSeconds = 2 });

        machine.TickOneSecond();
        machine.TickOneSecond();

        Assert.Equal(AgentState.LOCKED_IDLE, machine.Current);
    }

    [Fact]
    public void StateChanged_EventFires()
    {
        var logMock = new Mock<ILogSink>();
        var machine = new AgentStateMachine(logMock.Object);
        AgentState? previous = null;
        AgentState? current = null;
        machine.StateChanged += (p, c) => { previous = p; current = c; };

        machine.Fire(AgentEvent.ServerDiscovered);

        Assert.Equal(AgentState.DISCOVERING, previous);
        Assert.Equal(AgentState.LOCKED_IDLE, current);
    }

    [Fact]
    public void OnServerConnected_Discovering_FiresServerDiscovered()
    {
        var logMock = new Mock<ILogSink>();
        var machine = new AgentStateMachine(logMock.Object);

        machine.OnServerConnected();

        Assert.Equal(AgentState.LOCKED_IDLE, machine.Current);
    }

    [Fact]
    public void OnServerDisconnected_LockedIdle_FiresServerDisconnected()
    {
        var logMock = new Mock<ILogSink>();
        var machine = new AgentStateMachine(logMock.Object);
        machine.Fire(AgentEvent.ServerDiscovered);

        machine.OnServerDisconnected();

        Assert.Equal(AgentState.DISCONNECTED_LOCK, machine.Current);
    }

    [Fact]
    public void ApplySessionCommand_Lock_ResetsSessionId()
    {
        var logMock = new Mock<ILogSink>();
        var machine = new AgentStateMachine(logMock.Object);
        machine.Fire(AgentEvent.ServerDiscovered);
        machine.ApplySessionCommand(new SessionCommandPayload { Action = "START", SessionId = "SESS_001", DurationSeconds = 300 });

        machine.ApplySessionCommand(new SessionCommandPayload { Action = "LOCK" });

        Assert.Null(machine.ActiveSessionId);
        Assert.Equal(AgentState.LOCKED_IDLE, machine.Current);
    }
}
