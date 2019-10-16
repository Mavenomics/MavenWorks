import { Observable } from "rxjs";

/**
 * Staleness refers to some missing state that a parent should know about, but can't respond to immediately.
 * Staleness can be set by an external component, and includes an event for reacting to staleness.
 *
 * Staleness should not re-emit if the implementor is already stale.
 */
export interface IStaleable {
    readonly isStale: boolean;
    readonly OnStale: Observable<void>;
    setFresh(): void;
    setStale(): void;
}

/**
 * Dirtiness is closely tied to staleness, but is specific to models. Unlike staleness, dirtiness can only
 * be set by the implementor.
 *
 * Dirtiness should not re-emit if the implementor is already dirty.
 */
export interface IDirtyable {
    readonly isDirty: boolean;
    readonly OnDirty: Observable<void>;
    setClean(): void;
}
