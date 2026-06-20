import { PluginFrame, type PluginFrameProps, type PluginFrameResizeDirection } from "./plugin-frame";

export type PluginContainerResizeDirection = PluginFrameResizeDirection;
export type PluginContainerProps = PluginFrameProps;

export function PluginContainer(props: PluginContainerProps) {
  return <PluginFrame {...props} />;
}
