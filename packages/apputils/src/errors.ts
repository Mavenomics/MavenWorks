export class ValidationError extends Error {
    constructor(public readonly message: string) {
        super(`Validation Error: ${message}`);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ValidationError);
        }
    }
}

export class ConfigError extends Error {
    constructor(public readonly message: string) {
        super(`Config Error: ${message}`);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ConfigError);
        }
    }
}

export class AuthenticationError extends Error {
    public readonly detail: string;

    constructor(detail = "") {
        super(`Authentication Error: User not signed in. ${detail}`);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, AuthenticationError);
        }

        this.name = "AuthenticationError";
        this.detail = detail;
    }
}

export class TransportError extends Error {
    public readonly code: number;
    public readonly status: string;

    constructor(code: number, status = "") {
        super(`Transport Error: Request failed with ${code} ${status}`);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, TransportError);
        }

        this.name = "TransportError";
        this.code = code;
        this.status = status;
    }
}

export class NetworkError extends Error {
    public readonly oldError: Error;

    constructor(oldError: Error) {
        super(`Network Error: Failed to complete request: ${oldError.message}`);

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, TransportError);
        }

        this.name = "NetworkError";
        this.oldError = oldError;
    }
}
