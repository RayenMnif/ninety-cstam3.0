using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;

namespace NinetyAgent.Client.Networking;

[JsonSourceGenerationOptions(WriteIndented = false, PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(AgentEnvelopeHeader))]
[JsonSerializable(typeof(AgentEnvelope<ClientHeartbeatPayload>), TypeInfoPropertyName = "AgentEnvelopeClientHeartbeatPayload")]
[JsonSerializable(typeof(AgentEnvelope<SecurityAlertPayload>), TypeInfoPropertyName = "AgentEnvelopeSecurityAlertPayload")]
[JsonSerializable(typeof(AgentEnvelope<RemoteExecPayload>), TypeInfoPropertyName = "AgentEnvelopeRemoteExecPayload")]
[JsonSerializable(typeof(AgentEnvelope<SessionCommandPayload>), TypeInfoPropertyName = "AgentEnvelopeSessionCommandPayload")]
[JsonSerializable(typeof(AgentEnvelope<StationRegisterPayload>), TypeInfoPropertyName = "AgentEnvelopeStationRegisterPayload")]
[JsonSerializable(typeof(AgentEnvelope<AckPayload>), TypeInfoPropertyName = "AgentEnvelopeAckPayload")]
[JsonSerializable(typeof(AgentEnvelope<AuthLoginPayload>))]
[JsonSerializable(typeof(AgentEnvelope<AuthRegisterPayload>))]
[JsonSerializable(typeof(AgentEnvelope<AuthResponsePayload>))]
internal partial class AgentJsonContext : JsonSerializerContext
{
}
