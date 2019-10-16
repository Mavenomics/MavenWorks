import * as React from "react";
import { ProgressBar } from "@mavenomics/ui";

export const PartOverlay: React.SFC<PartOverlay.IProps> = ({
    partState,
    partStateDetail,
    onRequestRefresh,
    onRequestCancel
}) => {
    let showCancel = false;
    let showButton = false;
    let showHeader = true;
    switch (partState) {
        case "Calculating":
            showCancel = true;
            showButton = true;
            break;
        case "Error":
            showButton = true;
            break;
        case "Canceled":
        case "WaitForUser":
            showButton = true;
            showHeader = false;
            break;
    }
    const trySerializeObject = (obj: any) => {
        try {
            return JSON.stringify(obj);
        } catch (e) {
            // fun fact: in JS, finally blocks can _override_ the return value
            // of a function. eww
            return "" + obj;
        }
    };
    const renderError = () => {
        if (!(partStateDetail instanceof Error)) {
            return (<pre className="errorDetail">{trySerializeObject(partStateDetail)}</pre>);
        }
        let stack: React.ReactElement = <pre className="errorDetail">{partStateDetail.stack}</pre>;
        if ((partStateDetail as any)["prettyTraceback"] != null) {
            const formattedStack = (partStateDetail as any).prettyTraceback;
            stack = <div style={{
                    minWidth: "62em",
                    background: "var(--jp-error-color3)"
                }}
                className="jp-RenderedText"
                dangerouslySetInnerHTML={{__html: formattedStack}}></div>;
        }
        return (<div>
            <h2>{partStateDetail.message}</h2>
            { stack }
        </div>);
    };
    const renderDetail = () => {
        switch (partState) {
            case "Calculating":
                return (<div className="m-PartOverlay-center">
                    <ProgressBar></ProgressBar>
                    {(partStateDetail as string[])
                        .map(i => <p key={i}>Evaluating {i}</p>)}
                </div>);
            case "Rendering":
                return (<div className="m-PartOverlay-center">...</div>);
            case "Error":
                return renderError();
            default:
                return null;
        }
    };
    const renderButton = (isCancel: boolean) => {
        const iconClass = isCancel ? "fa-times" : "fa-refresh";
        const buttonClass = "m-PartOverlay-Button" +
            (showHeader ? "" : " m-PartOverlay-BigButton");
        return (<button className={buttonClass}
            onClick={() => isCancel ? onRequestCancel() : onRequestRefresh()}>
            <i className={"fa " + iconClass}></i>
            <span className="m-PartOverlay-ButtonContent">
                {isCancel ? "Cancel" : "Refresh"}
            </span>
        </button>);
    };
    const renderHeader = () => {
        return (<div className="m-PartOverlay-Header">
            <span className="m-PartOverlay-State m-PartOverlay-center">{partState}</span>
        </div>);
    };

    return (
        <div className="m-PartOverlay-Component">
            {showHeader ? renderHeader() : null}
            {renderDetail()}
            {showButton ? renderButton(showCancel) : null}
        </div>
    );
};

export namespace PartOverlay {
    export interface IProps {
        partState: string;
        partStateDetail: any;
        onRequestRefresh: (this: void) => void;
        onRequestCancel: (this: void) => void;
    }
}
