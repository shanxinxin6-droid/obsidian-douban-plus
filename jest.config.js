module.exports = {
    preset: 'ts-jest',
    rootDir: './',
    testPathIgnorePatterns: ['/node_modules/', '/.references/', '/.dev-vault/', '/dist/'],
    testRegex: '(/test/.*\\.(test|spec))\\.[tj]sx?$',
    moduleFileExtensions: [
        "ts",
        "tsx",
        "js",
        "jsx"
    ],
    moduleNameMapper: {
        '^@APP/(.*)$': '<rootDir>/src/douban/$1',
        '^src/(.*)$': '<rootDir>/src/$1'
    },
    collectCoverageFrom: [
        "src/org/wanxp/dashboard/**/*.ts",
        "!**/node_modules/**",
        "!**/vendor/**"
    ]
}
