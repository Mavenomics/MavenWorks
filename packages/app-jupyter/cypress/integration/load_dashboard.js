function getFile(name) {
    return cy.get(`[title^="${name}"] > .jp-DirListing-itemText`)
        .scrollIntoView();
}

const DEMOS = [
    "DetailHovers.ipynb",
    "Javascript Parts.ipynb",
    "Volatility3D.ipynb",
    "pnl5.ipynb"
];

describe("Loading Dashboard Notebooks", () => {
    before(() => {
        cy.visit("/lab");
        cy.get("#main")
            .should("be.visible");
        cy.get("#filebrowser")
            .should("be.visible");
    });

    beforeEach(() => {
        cy.get(".jp-HomeIcon")
            .click();
        getFile("demos")
            .dblclick();
    });

    afterEach(() => {
        cy.get("#jp-main-dock-panel .jp-mod-current > .p-TabBar-tabCloseIcon")
            .trigger("mousemove")
            .click();
        cy.get(".jp-mod-accept")
            .click();
    });

    for (const demo of DEMOS) {
        it(`should load ${demo} demo dashboard`, () => {
            getFile(demo)
                .dblclick();
            cy.get(".p-mod-current")
                .contains(demo);
            cy.get(".jp-Notebook")
                .should("be.visible");
            cy.get(".jp-Spinner")
                .should("not.be.visible");
            cy.get(".p-MenuBar-itemLabel:contains(\"Run\")")
                .click();
            cy.get("[data-command=\"runmenu:run-all\"] > .p-Menu-itemLabel")
                .trigger("mousemove")
                .click();
            cy.get(".m-RenderedLayout")
                .scrollIntoView()
                .should("be.visible");
            cy.get("m-RenderedLayout .m-PartOverlay")
                .should("not.be.visible");
            cy.wait(500); // HACK: Wait 500 ms to give parts a chance to render
            cy.get(".m-RenderedLayout")
                .screenshot();
        });
    }
});