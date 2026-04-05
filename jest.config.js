/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^@open-modeler-bindings/(.*)$': '<rootDir>/src/bindings/$1',
    },
    testMatch: ['**/tests/**/*_test.ts', '**/__tests__/**/*_test.ts'],
    transformIgnorePatterns: ['node_modules/(?!open-modeler-ts-core)'],
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                useESM: true,
                tsconfig: {
                    target: 'ES2022',
                },
            },
        ],
    },
};
