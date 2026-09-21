namespace NinetyAgent.Client.Networking;

public static class MessageType
{
    public const string ClientHeartbeat = "CLIENT_HEARTBEAT";
    public const string SecurityAlert = "SECURITY_ALERT";
    public const string RemoteExec = "REMOTE_EXEC";
    public const string SessionCommand = "SESSION_COMMAND"; 
    public const string StationRegister = "STATION_REGISTER";
    public const string Ack = "ACK";
}

public class AgentEnvelopeHeader
{
    public string Type { get; set; } = string.Empty;
}

public class AgentEnvelope<T>
{
    public string Type { get; set; } = string.Empty;
    public T Payload { get; set; } = default!;
}

public class ClientHeartbeatPayload
{
    public string StationId { get; set; } = string.Empty;
    public string? ActiveSessionId { get; set; }
    public string AgentState { get; set; } = string.Empty;
    public double CpuTempC { get; set; }
    public double GpuTempC { get; set; }
    public double CpuLoadPercent { get; set; }
    public int FanSpeedRpm { get; set; }
    public string PeripheralStatus { get; set; } = string.Empty;
    public int RemainingSeconds { get; set; }
}

public class SecurityAlertPayload
{
    public string StationId { get; set; } = string.Empty;
    public string AlertType { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
}

public class RemoteExecPayload
{
    public string Command { get; set; } = string.Empty;
    public string? Arguments { get; set; }
    public string? TargetExecutablePath { get; set; }
}

public class SessionCommandPayload
{
    public string Action { get; set; } = string.Empty;
    public string SessionId { get; set; } = string.Empty;
    public int DurationSeconds { get; set; }

    public decimal? WalletBalance { get; set; }
}
public class StationRegisterPayload
{
    public string StationId { get; set; } = string.Empty;
    public string StationName { get; set; } = string.Empty;
    public string AgentVersion { get; set; } = string.Empty;
    public string? BranchId { get; set; }
    public string Hostname { get; set; } = string.Empty;
    public string IpAddress { get; set; } = string.Empty;
}

public class AckPayload
{
    public string MessageId { get; set; } = string.Empty;
    public bool Success { get; set; }
}

public class DiscoveredServer
{
    public string Address { get; set; } = string.Empty;
    public int WebSocketPort { get; set; }
    public string IpAddress { get; set; } = string.Empty;
    public int Port { get; set; }
    public string ServerName { get; set; } = string.Empty;
}