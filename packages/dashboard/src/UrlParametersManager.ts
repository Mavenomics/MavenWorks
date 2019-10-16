import { Converters, Types } from "@mavenomics/coreutils";
import { Observable, ReplaySubject } from "rxjs";
import { GlobalsService } from "@mavenomics/bindings";
import { DashboardSerializer } from "./DashboardSerializer";
import ISerializedDashboard = DashboardSerializer.ISerializedDashboard;
import { HoverManager } from "@mavenomics/ui";

// In the future, we may have different types of parameters (for instance, one for Globals and one for Papermill)
// but for now, YAGNI applies

export class UrlParametersManager {
    public paramsDidChange: Observable<void>;
    // if the params *do* change we want to keep the latest one around
    private paramsDidChangeSrc$ = new ReplaySubject<void>(1);
    private params: { name: string, value: any }[] = [];

    constructor(private filter?: UrlParametersManager.IUrlParametersFilter) {
        this.paramsDidChange = this.paramsDidChangeSrc$.asObservable();
        window.addEventListener("hashchange", () => {
            this.fetchParameters();
            this.paramsDidChangeSrc$.next();
        }, { capture: false });
    }


    /** Load the parameter names and values into memory, but don't set them */
    fetchParameters() {
        this.params = [];
        let urlParams = decodeURIComponent(window.location.hash);
        if (urlParams.startsWith("#")) {
            urlParams = urlParams.slice(1);
        }
        if (urlParams === "") {
            return; // no params
        }
        for (const param of urlParams.split(";")) {
            const [name, serializedValue] = (param.split("=") as [string, string]);
            if (name === "" || serializedValue === "") {
                continue; // just skip it if we can't parse it
            }
            if (this.filter && this.filter.filterParameter(name, serializedValue))
                continue;
            let value = null;
            try {
                value = serializedValue;
            } catch (e) {
                console.warn("Couldn't parse parameter", name);
                console.warn(e);
                continue; // again, skip if we can't parse
            }
            this.params.push({ name, value });
        }
    }

    /** Apply the parameters all at once
     * We do this in another lifecycle function to allow for changes/tweaks to how/when these get applied
     */
    applyParameters(globals: GlobalsService) {
        const deferredErrors: [string, Error][] = [];
        for (const param of this.params) {
            let jsonValue: any;
            try {
                jsonValue = JSON.parse(param.value);
            } catch (err) {
                deferredErrors.push([param.name, err]);
                continue;
            }
            let globalValue: any;
            try {
                const type = globals.getType(param.name);
                globalValue = Converters.deserialize({
                    typeName: type.serializableName,
                    value: jsonValue
                });
            } catch (err) {
                deferredErrors.push([param.name, err]);
                continue;
            }
            globals.set(param.name, globalValue);
        }
        if (deferredErrors.length > 0) {
            const text = deferredErrors
                .map(([name, err]) => `<h3>Parsing ${name} failed</h3>
                <pre>${(err instanceof Error ? err : Error(err)).stack}</pre>`)
                .join("");
            HoverManager.Instance!.openErrorDialog(text, true);
        }
    }

    //Used to deserialize and validate global overrides prior to loading the dashboard.
    deserializeParameters(dash: ISerializedDashboard): { [name: string]: any; } {
        if (dash.globals == null || dash.globals.length === 0)
            return {};
        const deferredErrors: [string, Error][] = [];
        let overrides: { [name: string]: any; } = {};
        for (const param of this.params) {
            let jsonValue: any;
            try {
                jsonValue = JSON.parse(param.value);
            } catch (err) {
                deferredErrors.push([param.name, err]);
                continue;
            }
            let globalValue: any;
            try {
                const global = dash.globals.find(g => g.name === param.name);
                if (global == null)
                    throw Error("No global named " + param.name + " exists");
                const type = Types.findType(global.type) || Types.Any;
                globalValue = Converters.deserialize({
                    typeName: type.serializableName,
                    value: jsonValue
                });
                overrides[global.name] = globalValue;
            } catch (err) {
                deferredErrors.push([param.name, err]);
                continue;
            }
        }
        if (deferredErrors.length > 0) {
            const text = deferredErrors
                .map(([name, err]) => `<h3>Parsing ${name} failed</h3>
                <pre>${(err instanceof Error ? err : Error(err)).stack}</pre>`)
                .join("");
            HoverManager.Instance!.openErrorDialog(text, true);
        }
        return overrides;
    }
}

export namespace UrlParametersManager {
    export interface IUrlParametersFilter {
        //Return true to signal that the parameter isn't a global
        filterParameter(name: string, serialziedValue: string): boolean;
    }
}
