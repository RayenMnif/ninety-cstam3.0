using System;
using System.Collections.Generic;
using NinetyAgent.Client.Networking;

namespace NinetyAgent.Client.Core;

public enum AgentState
{
    DISCOVERING,
    LOCKED_IDLE,
    ACTIVE_SESSION,
    PAUSED,
    DISCONNECTED_LOCK
}

public enum AgentEvent
{
    ServerDiscovered,
    ServerConnected,
    ServerDisconnected,
    CommandStart,
    CommandPause,
    CommandLock,
    CommandUnlock,
    TimerExpired
}

/// <summary>
/// Authoritative state machine tracking station session state.
/// </summary>
public sealed class AgentStateMachine
{
    private static readonly Dictionary<(AgentState, AgentEvent), AgentState> Transitions = new()
    {
        [(AgentState.DISCOVERING, AgentEvent.ServerDiscovered)] = AgentState.LOCKED_IDLE,

        [(AgentState.LOCKED_IDLE, AgentEvent.CommandStart)] = AgentState.ACTIVE_SESSION,
        [(AgentState.LOCKED_IDLE, AgentEvent.ServerDisconnected)] = AgentState.DISCONNECTED_LOCK,

        [(AgentState.ACTIVE_SESSION, AgentEvent.CommandPause)] = AgentState.PAUSED,
        [(AgentState.ACTIVE_SESSION, AgentEvent.CommandLock)] = AgentState.LOCKED_IDLE,
        [(AgentState.ACTIVE_SESSION, AgentEvent.TimerExpired)] = AgentState.LOCKED_IDLE,
        [(AgentState.ACTIVE_SESSION, AgentEvent.ServerDisconnected)] = AgentState.DISCONNECTED_LOCK,

        [(AgentState.PAUSED, AgentEvent.CommandStart)] = AgentState.ACTIVE_SESSION,
        [(AgentState.PAUSED, AgentEvent.CommandLock)] = AgentState.LOCKED_IDLE,
        [(AgentState.PAUSED, AgentEvent.ServerDisconnected)] = AgentState.DISCONNECTED_LOCK,

        [(AgentState.DISCONNECTED_LOCK, AgentEvent.ServerConnected)] = AgentState.LOCKED_IDLE,
    };

    private readonly ILogSink _log;

    public AgentState Current { get; private set; } = AgentState.DISCOVERING;
    public string? ActiveSessionId { get; private set; }
    public int RemainingSeconds { get; private set; }

    public event Action<AgentState, AgentState>? StateChanged;

    public AgentStateMachine(ILogSink log)
    {
        _log = log;
    }

    public bool Fire(AgentEvent evt)
    {
        if (!Transitions.TryGetValue((Current, evt), out var next))
        {
            _log.Warn($"[StateMachine] Ignored illegal transition: {evt} from {Current}.");
            return false;
        }

        var previous = Current;
        Current = next;
        _log.Info($"[StateMachine] {previous} --{evt}--> {Current}");
        StateChanged?.Invoke(previous, Current);
        return true;
    }

    public void ApplySessionCommand(SessionCommandPayload command)
    {
        switch (command.Action)
        {
            case "START":
                ActiveSessionId = command.SessionId;
                RemainingSeconds = command.DurationSeconds;
                Fire(AgentEvent.CommandStart);
                break;
            case "PAUSE":
                Fire(AgentEvent.CommandPause);
                break;
            case "LOCK":
                ActiveSessionId = null;
                Fire(AgentEvent.CommandLock);
                break;
            case "UNLOCK":
                RemainingSeconds = command.DurationSeconds > 0 ? command.DurationSeconds : int.MaxValue;
                Fire(AgentEvent.CommandStart);
                break;
            default:
                _log.Warn($"[StateMachine] Unknown SESSION_COMMAND action '{command.Action}'.");
                break;
        }
    }

    public void TickOneSecond()
    {
        if (Current != AgentState.ACTIVE_SESSION) return;
        if (RemainingSeconds == int.MaxValue) return;

        RemainingSeconds = Math.Max(0, RemainingSeconds - 1);
        if (RemainingSeconds == 0)
        {
            Fire(AgentEvent.TimerExpired);
        }
    }

    public void OnServerConnected() => Fire(Current == AgentState.DISCOVERING ? AgentEvent.ServerDiscovered : AgentEvent.ServerConnected);

    public void OnServerDisconnected() => Fire(AgentEvent.ServerDisconnected);
}