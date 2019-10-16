// TODO: I don't think this file was covered under the linter in old WebMaven
// When we revamp types, remove the line below
// tslint:disable
export class Type {
    public readonly baseType: Type | null;
    public readonly name: string;
    public readonly genericArgs: Type[];

    constructor(name: string, baseType: Type | null, genericArgs: Type[] = []) {
        this.name = name;
        this.baseType = baseType;
        this.genericArgs = genericArgs;
    }

    get serializableName(): string {
        //Todo: Support generic types.
        return this.name;
    }

    private static genericArgsMatch(left: Type, right: Type) {
        //Support basic covariance
        return left.genericArgs.length == right.genericArgs.length
            && left.genericArgs.every((l, i) => l.isInstanceOf(right.genericArgs[i]));
    }

    public isInstanceOf(target: Type): boolean {
        if (target.name == "Any" || this.name == "Any")
            return true;
        var current: Type | null = this;
        do {
            if (current.name == target.name && Type.genericArgsMatch(current, target))
                return true;
            current = current.baseType;
        } while (current != null);
        return false;
    }

    public equals(rhs:Type) {
        //For now type equality is simply comparing names.
        return this.name == rhs.name;
    }
}


export class Types {
    public static registerType(type: Type) {
        this.registered.push(type);
    }

    public static array(type: Type) {
        return new Type("Array", Types.Object, [type]);
    }

    public static tuple(...types: Type[]) {
        return new Type("Tuple", Types.Object, types);
    }

    public static Object = new Type("Object", null);
    public static Any = new Type("Any", Types.Object);
    public static String = new Type("String", Types.Object);
    public static Date = new Type("Date", Types.Object);
    public static DateTime = new Type("DateTime", Types.Date);
    public static Number = new Type("Number", Types.Object);
    public static Table = new Type("Table", Types.Object);
    public static Row = new Type("Row", Types.Object);
    public static Error = new Type("Error", Types.Object);
    public static Boolean = new Type("Boolean", Types.Any);
    public static Array = Types.array(Types.Any);
    public static Color = new Type("Color", Types.Object);

    static registered: Type[] = [
        Types.Object,
        Types.Any,
        Types.String,
        Types.DateTime,
        Types.Date,
        Types.Number,
        Types.Table,
        Types.Row,
        Types.Error,
        Types.Boolean,
        Types.Array,
        Types.Color
    ];

    //Todo: Support generics
    public static findType(name:string) {
        return Types.registered.find(t => t.name == name);
    }

}
