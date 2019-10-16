// A set of utility functions for iterators. If you develop any new ones, put them here.
// are we STL programmers yet?
export namespace IterTools {
    /**
     * Array.prototype.map, but for iterables
     * @param container An iterable container of values to map over
     * @param fn A function to apply to every value in the container
     */
    export function* map<_ContainerType, _TransformedContainerType>(container: Iterable<_ContainerType>,
                                                                fn: (i: _ContainerType) => _TransformedContainerType
                                                                ): IterableIterator<_TransformedContainerType> {
        for (const value of container) {
            yield fn(value);
        }
    }

    /**
     * Array.prototype.filter, but for iterables
     * @param container An iterable container of values to filter
     * @param predicate A function that returns true if the given value should
     * pass through the filter, false otherwise.
     */
    export function* filter<_ContainerType>(
        container: Iterable<_ContainerType>,
        predicate: (i: _ContainerType) => boolean,
    ): IterableIterator<_ContainerType> {
        for (const value of container) {
            let result = true;
            try {
                result = !!predicate(value);
            } catch (err) {
                throw new Error(
                    "IterationError: Unhandled exception in predicate.\n" +
                    err
                );
            }
            if (result) {
                yield value;
            }
        }
    }

    /**
     * Wait until all promises in a container resolve, returning an array of their results
     * Beware: this function flattens the iterable!
     * @param container The container of promises to wait on
     */
    export function all<_ContainerType>(container: Iterable<Promise<_ContainerType>>): Promise<Array<_ContainerType>> {
        return Promise.all(Array.from(container));
    }

    /**
     * Return an iterable that enumerates the nodes of a tree, depth-first
     * @param container An iterable container of tree nodes
     * @param getChildren Lambda to retrieve the children of a given node. If the node has no children, this lambda
     * should return either `undefined` or an empty array.
     */
    export function* dfs_iter<_ContainerType>(
        container: Iterable<_ContainerType>,
        getChildren: (i: _ContainerType) => Iterable<_ContainerType> | undefined | EmptyArray<_ContainerType>
    ): IterableIterator<_ContainerType> {
        for (const child of container) {
            const children = getChildren(child);
            if (children != null && !isEmptyArray(children)) {
                // not a leaf node
                yield* dfs_iter(children, getChildren);
            }
            yield child;
        }
    }

    /**
     * Merge a heterogenous list of iteratables together into one iterable.
     *
     * #### Notes
     *
     * Each provided iterable will be appended in argument order.
     */
    export function* merge<_ContainerType>(
        ...iterators: Array<Iterable<_ContainerType>>
    ): Iterable<_ContainerType> {
        for (const iterator of iterators) {
            yield* iterator;
        }
    }

    /**
     * Merge a list of iterables together, plucking any duplicates.
     *
     * NOTE: This function materializes the given iterables inside a Set, and thus
     * is inappropriate for especially large iterables.
     */
    export function* mergeUnique<_ContainerType>(
        ...iterators: Array<Iterable<_ContainerType>>
    ): Iterable<_ContainerType> {
        const set = new Set<_ContainerType>();
        for (let i = 0; i < iterators.length; i++) {
            for (const item of iterators[i]) {
                set.add(item);
            }
        }
        yield* set.values();
        set.clear();
    }

    interface EmptyArray<_ContainerType> extends Array<_ContainerType> {
        length: 0;
    }

    function isEmptyArray<_ContainerType>(test: unknown): test is EmptyArray<_ContainerType> {
        return Array.isArray(test) && test.length === 0;
    }
}
