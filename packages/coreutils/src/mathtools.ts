export namespace MathTools {
    /**
     * Clamp a value to a specified integer range [min, max], without scaling.
     *
     * @param val The value to clamp
     * @param min Minimum value
     * @param max Maximum value
     * @returns An integer in [min, max]
     */
    export function Clamp(val: number, min: number, max: number) {
        return Math.floor(Math.min(Math.max(val, min), max));
    }

    /**
     * Clamp a rectangle to within a given boundary.
     *
     * The position is assumed to be relative to the boundary.
     *
     * @param rectPos The position of the rect, as an [x, y] pair
     * @param rectSize The size of the rect, as a [width, height] pair
     * @param bounds The canvas boundary, as a [width, height] pair
     * @returns The dimensions of the clamped rect, as a 4-tuple of [x, y, width, height].
     */
    export function ClampRectToBounds(
        rectPos: Readonly<Vec2>,
        rectSize: Readonly<Vec2>,
        bounds: Readonly<Vec2>
    ): [number, number, number, number] {
        const clampedPos = [
            MathTools.Clamp(rectPos[0], 0, bounds[0]),
            MathTools.Clamp(rectPos[1], 0, bounds[1]),
        ] as const;

        const sizeBounds = Vec2.Sub(bounds, clampedPos);
        const clampedSize = [
            MathTools.Clamp(rectSize[0], 50, Math.max(50, sizeBounds[0])),
            MathTools.Clamp(rectSize[1], 50, Math.max(50, sizeBounds[1]))
        ] as const;

        return [
            ...clampedPos,
            ...clampedSize
        ] as [number, number, number, number];
    }

    /**
     * 2-tuple representing a vector in screen space
     */
    export type Vec2 = [number, number];

    export namespace Vec2 {
        export function Add(lhs: Readonly<Vec2>, rhs: Readonly<Vec2>): Vec2 {
            return [lhs[0] + rhs[0], lhs[1] + rhs[1]];
        }

        export function Sub(lhs: Readonly<Vec2>, rhs: Readonly<Vec2>): Vec2 {
            return [lhs[0] - rhs[0], lhs[1] - rhs[1]];
        }

        export function Dot(lhs: Readonly<Vec2>, rhs: Readonly<Vec2>) {
            return lhs[0] * rhs[0] + lhs[1] * rhs[1];
        }

        /**
         * Compute the L1-Norm (sum of absolute values of the components) of a Vec2
         *
         * L1-Norm is also called the "Manhattan norm," after Manhattan geometry.
         *
         * @returns The scalar L1-norm of `vec`
         */
        export function Norm(vec: Readonly<Vec2>) {
            return Math.abs(vec[0]) + Math.abs(vec[1]);
        }

        export function Magnitude(vec: Readonly<Vec2>) {
            return Math.sqrt(Dot(vec, vec));
        }
    }
}
