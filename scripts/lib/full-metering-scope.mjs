// Closed source scopes, never a caller-supplied exclusion list. Internal channel
// references survive host migration; this module does not rename identities.
export const FULL_METERING_SCOPE = "full-five-v1";
export const LOCAL_METERING_SCOPE = "local-three-v1";
export const FULL_METERING_CHANNELS = Object.freeze([
  { channelRef: "channel-vultr-a-vless-reality-tcp", sourceRef: "full_metering_xray_cumulative_v1", mode: "cumulative" },
  { channelRef: "channel-sgp-a-vless-reality-tcp", sourceRef: "full_metering_xray_cumulative_v1", mode: "cumulative" },
  { channelRef: "channel-vultr-a-hy2", sourceRef: "full_metering_hy2_cumulative_v1", mode: "cumulative" },
  { channelRef: "channel-sgp-a-hy2", sourceRef: "full_metering_hy2_cumulative_v1", mode: "cumulative" },
  { channelRef: "channel-vultr-a-tuic", sourceRef: "full_metering_tuic_connections_v1", mode: "connections" }
].map(Object.freeze));
const LOCAL_CHANNELS = Object.freeze(FULL_METERING_CHANNELS.filter(source => !source.channelRef.startsWith("channel-sgp-")));
const fail = code => { throw Object.assign(new Error(code), { code }); };
export function fullMeteringChannels(meteringScope = FULL_METERING_SCOPE) {
  if (meteringScope === FULL_METERING_SCOPE) return FULL_METERING_CHANNELS;
  if (meteringScope === LOCAL_METERING_SCOPE) return LOCAL_CHANNELS;
  fail("full_metering_scope_invalid");
}
export function validateFullMeteringContext(context) {
  const local = context?.meteringScope === LOCAL_METERING_SCOPE;
  const keys = local ? "databaseIdentityDigest,meteringScope,scopeDigest" : "databaseIdentityDigest,scopeDigest";
  if (!context || Object.keys(context).sort().join(",") !== keys
    || ![context.databaseIdentityDigest, context.scopeDigest].every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))) fail("full_metering_context_invalid");
  return local ? LOCAL_METERING_SCOPE : FULL_METERING_SCOPE;
}
export function assertFullMeteringContextScope(context, meteringScope = FULL_METERING_SCOPE) {
  fullMeteringChannels(meteringScope);
  if (validateFullMeteringContext(context) !== meteringScope) fail("full_metering_context_scope_changed");
}
export function assertFullMeteringCheckpointScope(checkpoint, meteringScope = FULL_METERING_SCOPE) {
  const channels = fullMeteringChannels(meteringScope);
  if (!checkpoint || (meteringScope === LOCAL_METERING_SCOPE
    ? checkpoint.meteringScope !== LOCAL_METERING_SCOPE : Object.hasOwn(checkpoint, "meteringScope"))
    || !Array.isArray(checkpoint.sources) || checkpoint.sources.length !== channels.length
    || new Set(checkpoint.sources.map(source => source?.channelRef)).size !== channels.length
    || checkpoint.sources.some(source => !channels.some(expected => expected.channelRef === source?.channelRef))) fail("full_metering_checkpoint_scope_changed");
}
