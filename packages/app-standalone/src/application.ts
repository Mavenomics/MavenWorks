import { Application, IPlugin } from "@phosphor/application";
import { KitchenSink } from "./shell";

export class MainApp extends Application<KitchenSink> {
}

export type SinkPlugin<_Provides> = IPlugin<MainApp, _Provides>;
