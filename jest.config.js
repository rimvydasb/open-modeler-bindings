/** @type {import('ts-jest').JestConfigWithTsJest} **/
export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapper: {
        // Order matters: more specific first
        '^@open-modeler-bindings/v1alpha/(.*)\\.js$': '<rootDir>/src/bindings/v1alpha/$1.ts',
        '^@open-modeler-bindings/v1alpha/(.*)$': '<rootDir>/src/bindings/v1alpha/$1',
        
        '^@open-modeler-bindings/(.*)\\.js$': '<rootDir>/src/bindings/v1alpha/$1.ts',
        '^@open-modeler-bindings/(.*)$': '<rootDir>/src/bindings/v1alpha/$1',
        
        '^@open-modeler-engine/(.*)\\.js$': '<rootDir>/src/engine/$1.ts',
        '^@open-modeler-engine/(.*)$': '<rootDir>/src/engine/$1',
        
        '^@open-modeler-ts-project/(.*)\\.js$': '<rootDir>/src/ts-project/$1.ts',
        '^@open-modeler-ts-project/(.*)$': '<rootDir>/src/ts-project/$1',

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
