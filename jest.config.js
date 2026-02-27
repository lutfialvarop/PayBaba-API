export default {
    testEnvironment: "node",
    transform: {},
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
    },
    testMatch: ["**/__tests__/**/*.test.js"],
    coveragePathIgnorePatterns: ["/node_modules/"],
    testTimeout: 10000,
    collectCoverageFrom: ["src/**/*.js", "!src/database/**", "!src/utils/logger.js"],
};
