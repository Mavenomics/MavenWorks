import { Application, IPlugin } from "@phosphor/application";
import { MavenWorksShell } from "./shell";

export class MainApp extends Application<MavenWorksShell> {
}

export type MavenWorksPlugin<_Provides> = IPlugin<MainApp, _Provides>;
