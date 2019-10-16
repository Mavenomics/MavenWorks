/**
 * Created by nick on 2/11/2015.
 */
/*
 TODO
 * Implement other functions supported by conditional formatting
 *  * Resharper  Ctrl+T "MiniEngine" GetSupportedFunctions()
 */
/**
 * Created by nick on 2/11/2015.
 */
/*
 TODO
 * Implement other functions supported by conditional formatting
 *  * Resharper  Ctrl+T "MiniEngine" GetSupportedFunctions()
 */
export class ConditionalFormatting {
    private condition: string;
    private compiled: string | undefined;
    private options: any;

    constructor(condition?: string, options?: any) {
        this.condition = condition || "";
        this.options = Object.assign({
            ForeColor: "",
            BackColor: "",
            IsBold: false,
            IsItalic: false
        }, options || {});
        this.compileCondition();
    }

    // testing only
    public getCompiled() {
        if (!this.compiled)
            this.compileCondition();
        return this.compiled;
    }

    public setCondition(newCondition: string) {
        this.condition = newCondition;
        this.compileCondition();
        return this;
    }

    public getCondition() {
        return this.condition;
    }

    // todo: options interface
    public setOption(newOptions: any) {
        this.options = Object.assign({}, this.options, newOptions);
        return this; // TODO: does anything use this fluently?
    }

    public getOptions() {
        return this.options;
    }

    // TODO: typings
    public compute(data: any) {
        function getRowValue(c: any) {
            return data[c];
        }
        try {
            // TODO: function constructor
            // tslint:disable-next-line: no-eval
            return eval(this.compiled!);
        } catch (err) {
            return err;
        }
    }

    private compileCondition() {
        if (!this.condition) return;
        this.compiled = this.condition
            .replace(/(and)/gi, "&&")
            .replace(/(or)/gi, "||");
    }
}

