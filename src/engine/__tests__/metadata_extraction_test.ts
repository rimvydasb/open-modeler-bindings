import {describe, it, expect} from '@jest/globals';
import {Project, SyntaxKind} from 'ts-morph';

describe('ts-morph metadata extraction experiments', () => {
    it('extracts return types and requirements from accessors', () => {
        const project = new Project({useInMemoryFileSystem: true});
        project.createSourceFile(
            'main.ts',
            `
        function calc(args: {a: number}): {b: number} { return {b: 1}; }
        class W {
            accessor myIn = { val: 10 };
            get node() { return calc({a: this.myIn.val}); }
        }
        `,
        );
        const file = project.getSourceFileOrThrow('main.ts');
        const cls = file.getClassOrThrow('W');

        const tc = project.getTypeChecker();
        const extractProps = (type: any, node: any) => {
            if (type.isObject() && !type.isArray()) {
                return type.getProperties().map((p: any) => ({
                    name: p.getName(),
                    type: tc.getTypeOfSymbolAtLocation(p, node).getText(),
                }));
            }
            return {type: type.getText()};
        };

        const results: any[] = [];

        cls.getGetAccessors().forEach((getter) => {
            const returnType = getter.getReturnType();
            const returnMeta = extractProps(returnType, getter);
            let reqMeta: any = [];

            const returnStmt = getter.getStatements().find((s) => s.getKind() === SyntaxKind.ReturnStatement);
            if (returnStmt && returnStmt.isKind(SyntaxKind.ReturnStatement)) {
                const expr = returnStmt.getExpression();
                if (expr && expr.isKind(SyntaxKind.CallExpression)) {
                    const signature = tc.getResolvedSignature(expr);
                    if (signature) {
                        const params = signature.getParameters();
                        if (params.length > 0) {
                            const firstParamType = params[0].getTypeAtLocation(expr);
                            reqMeta = extractProps(firstParamType, expr);
                        }
                    }
                }
            }
            results.push({name: getter.getName(), kind: 'getter', returnMeta, reqMeta});
        });

        cls.getProperties().forEach((prop) => {
            // accessors are properties in ts-morph
            const returnType = prop.getType();
            const returnMeta = extractProps(returnType, prop);
            results.push({name: prop.getName(), kind: 'property', returnMeta, reqMeta: []});
        });

        expect(results).toEqual([
            {
                name: 'node',
                kind: 'getter',
                returnMeta: [{name: 'b', type: 'number'}],
                reqMeta: [{name: 'a', type: 'number'}],
            },
            {
                name: 'myIn',
                kind: 'property',
                returnMeta: [{name: 'val', type: 'number'}],
                reqMeta: [],
            },
        ]);
    });
});
