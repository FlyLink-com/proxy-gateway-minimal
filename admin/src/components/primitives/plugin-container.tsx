import { PluginFrame, type PluginFrameProps } from "./plugin-frame";

export type PluginContainerProps = PluginFrameProps;

export function PluginContainer(props: PluginContainerProps) {
  return <PluginFrame {...props} />;
}
