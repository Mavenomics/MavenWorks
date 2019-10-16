import { BoxLayout, Widget } from "@phosphor/widgets";
import { InputWidgets, HoverManager } from "@mavenomics/ui";
import { IUserManager, AuthenticationError } from "@mavenomics/apputils";

export class Login extends Widget {
    public readonly layout: BoxLayout = new BoxLayout({direction: "top-to-bottom"});
    private msg = new Widget({node: document.createElement("span")});
    private username = new InputWidgets.Text();
    private password = new InputWidgets.Text();

    constructor(msg?: string) {
        super({node: document.createElement("form")});
        this.password.type = "password";
        this.password.label = "Password";
        this.password.name = "password";
        this.password.autocomplete = "current-password";
        this.username.label = "Username";
        this.username.name = "username";
        this.username.autocomplete = "username";
        if (msg != null) {
            this.msg.addClass("m-Login-Msg");
            this.msg.node.textContent = msg;
        }
        this.layout.addWidget(this.msg);
        this.layout.addWidget(this.username);
        this.layout.addWidget(this.password);
    }

    public getValue() {
        return ["" + this.username.value, "" + this.password.value] as const;
    }
}

export async function login(userManager: IUserManager, owner: Widget, msg?: string): Promise<boolean> {
    const dialogRes = await HoverManager.GetManager().launchDialog(
        new Login(msg),
        owner,
        400,
        175,
        "Login",
        [{ text: "Dismiss" }, { text: "Login", accept: true }]
    );
    if (!dialogRes.accept) return false;
    const [username, password] = dialogRes.result!;
    try {
        await userManager.login(username, password);
        return true;
    } catch (e) {
        if (e instanceof AuthenticationError) {
            return login(userManager, owner, e.detail);
        }
        console.warn("Uncaught error: ", e);
        return false;
    }
}
