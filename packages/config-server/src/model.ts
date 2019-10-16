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
