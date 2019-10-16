module.exports = {
  globals: {
    "ts-jest": {
      "tsConfig": "<rootDir>/tsconfig.json"
    }
  },
  moduleFileExtensions: [
    "ts",
    "tsx",
    "js"
  ],
  moduleNameMapper: {
    "\\.(?:css|less)$": "<rootDir>/__mocks__/fileMock.js",
    "^worker\\-loader\\!.+$": "<rootDir>/__mocks__/fileMock.js",
    [String.raw`^\@jupyterlab\/.+$`]: "<rootDir>/__mocks__/fileMock.js",
  },
  testMatch: [
    "<rootDir>/src/**/*.spec.+(ts|tsx|js)"
  ],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest"
  },
};
