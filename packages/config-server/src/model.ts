import { Entity, Column, PrimaryColumn } from "typeorm";

@Entity()
export class DashboardModel {
    @PrimaryColumn()
    public name!: string;

    @Column("blob")
    public data!: string;
}

@Entity()
export class UserModel {
    @PrimaryColumn()
    public username!: string;

    @Column()
    public password!: string;
}

export function getPrimaryKey(model: DashboardModel | UserModel) {
    // TODO: When we add more model types, this function should become more generic
    if (model instanceof UserModel) return "username";
    return "name";
}
