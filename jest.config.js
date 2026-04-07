/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        '^@open-modeler-bindings/(.*)\\.js$': '<rootDir>/src/bindings/v1alpha/index.ts',
        '^@open-modeler-bindings$': '<rootDir>/src/bindings/v1alpha/index.ts',
        
        '^@open-modeler-engine/(.*)\\.js$': '<rootDir>/src/engine/index.ts',
        '^@open-modeler-engine$': '<rootDir>/src/engine/index.ts',
        
        '^@open-modeler-ts-project/(.*)\\.js$': '<rootDir>/src/ts-project/index.ts',
        '^@open-modeler-ts-project$': '<rootDir>/src/ts-project/index.ts',

        '^(\\.{1,2}/.*)\\.js$': '$1',
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
