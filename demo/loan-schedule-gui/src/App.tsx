import React, { useState, useEffect, useRef } from 'react';
import { 
    Container, 
    Grid, 
    Paper, 
    Typography, 
    TextField, 
    Button, 
    Table, 
    TableBody, 
    TableCell, 
    TableContainer, 
    TableHead, 
    TableRow,
    Box,
    CircularProgress
} from '@mui/material';
import { LineChart } from '@mui/x-charts';

// Import source code as strings for the engine
// @ts-ignore
import bindingsSrc from '../../../src/bindings.ts?raw';
// @ts-ignore
import typesSrc from '../../loan-schedule/types.ts?raw';
// @ts-ignore
import librarySrc from '../../loan-schedule/library.ts?raw';
// @ts-ignore
import mainSrc from '../../loan-schedule/main.ts?raw';

import { OpenModelTSEngine } from '@engine';
import type { LoanInputs } from '@loan-types';

const INITIAL_INPUTS: LoanInputs = {
    loanAmount: 100000,
    annualInterestRate: 5.0,
    termMonths: 12,
    startDate: new Date('2026-04-01'),
};

export default function App() {
    const [inputs, setInputs] = useState<LoanInputs>(INITIAL_INPUTS);
    const [results, setResults] = useState<any>(null);
    const [isBooting, setIsBooting] = useState(true);
    const engineRef = useRef<OpenModelTSEngine | null>(null);

    useEffect(() => {
        const initEngine = async () => {
            const engine = new OpenModelTSEngine({ debug: true });
            try {
                await engine.loadProject({
                    "/src/bindings.ts": bindingsSrc,
                    "/demo/loan-schedule/types.ts": typesSrc,
                    "/demo/loan-schedule/library.ts": librarySrc,
                    "/demo/loan-schedule/main.ts": mainSrc,
                });
                await engine.boot();

                // 1. Register Event Listeners for UI updates
                engine.onNodeDataChanged("myWorkbook", "renderLoanScheduleTable", (data) => {
                    setResults((prev: any) => ({ ...prev, table: data }));
                });

                engine.onNodeDataChanged("myWorkbook", "renderLoanBalanceChart", (data) => {
                    setResults((prev: any) => ({ ...prev, chart: data }));
                });

                engineRef.current = engine;
                
                // 2. Initial Evaluation: This will trigger the events registered above
                runEvaluation(engine);
                setIsBooting(false);
            } catch (err) {
                console.error("Failed to boot engine:", err);
            }
        };

        initEngine();

        return () => {
            if (engineRef.current) {
                engineRef.current.dispose();
                engineRef.current = null;
            }
        };
    }, []);

    const runEvaluation = (engine: OpenModelTSEngine) => {
        // Trigger Sink Nodes. In the new architecture, these bypass TRACE_STORE 
        // and push data directly via onNodeDataChanged events.
        engine.executeWorkbook("myWorkbook", "renderLoanScheduleTable");
        engine.executeWorkbook("myWorkbook", "renderLoanBalanceChart");
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        
        const newInputs = {
            loanAmount: Number(formData.get('loanAmount')),
            annualInterestRate: Number(formData.get('annualInterestRate')),
            termMonths: Number(formData.get('termMonths')),
            // QuickJS needs ISO string or primitive for Date handle if not using vmRef
            startDate: new Date(formData.get('startDate') as string).toISOString(),
        };

        setInputs({
            ...newInputs,
            startDate: new Date(formData.get('startDate') as string)
        } as any);

        if (engineRef.current) {
            engineRef.current.mutate("inputVariables", newInputs);
            runEvaluation(engineRef.current);
        }
    };

    if (isBooting) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Booting QuickJS Engine...</Typography>
            </Box>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" gutterBottom>
                Loan Schedule - Dynamic QuickJS Engine
            </Typography>

            <Grid container spacing={3}>
                {/* 1. Input Section */}
                <Grid size={{ xs: 12, md: 4 }}>
                    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="h6" gutterBottom>Inputs</Typography>
                        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
                            <TextField
                                margin="normal"
                                fullWidth
                                label="Loan Amount"
                                name="loanAmount"
                                type="number"
                                defaultValue={inputs.loanAmount}
                            />
                            <TextField
                                margin="normal"
                                fullWidth
                                label="Annual Interest Rate (%)"
                                name="annualInterestRate"
                                type="number"
                                slotProps={{ htmlInput: { step: "0.1" } }}
                                defaultValue={inputs.annualInterestRate}
                            />
                            <TextField
                                margin="normal"
                                fullWidth
                                label="Term (Months)"
                                name="termMonths"
                                type="number"
                                defaultValue={inputs.termMonths}
                            />
                            <TextField
                                margin="normal"
                                fullWidth
                                label="Start Date"
                                name="startDate"
                                type="date"
                                slotProps={{ inputLabel: { shrink: true } }}
                                defaultValue={new Date(inputs.startDate).toISOString().split('T')[0]}
                            />
                            <Button
                                type="submit"
                                fullWidth
                                variant="contained"
                                sx={{ mt: 3, mb: 2 }}
                            >
                                Update Calculations (QuickJS)
                            </Button>
                        </Box>
                    </Paper>
                </Grid>

                {/* 2. Chart Section */}
                <Grid size={{ xs: 12, md: 8 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" gutterBottom>Remaining Balance Chart</Typography>
                        {results?.chart && (
                            <LineChart
                                xAxis={[{ 
                                    data: results.chart.map((_: any, index: number) => index + 1),
                                    label: 'Month'
                                }]}
                                series={[{
                                    data: results.chart.map((item: any) => item.remainingBalance),
                                    label: 'Remaining Balance',
                                    area: true,
                                }]}
                                height={300}
                                margin={{ left: 70, right: 30, top: 30, bottom: 50 }}
                            />
                        )}
                    </Paper>
                </Grid>

                {/* 3. Table Section */}
                <Grid size={{ xs: 12 }}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" gutterBottom>Loan Schedule Table</Typography>
                        <TableContainer sx={{ maxHeight: 400 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Month</TableCell>
                                        <TableCell>Date</TableCell>
                                        <TableCell align="right">Payment</TableCell>
                                        <TableCell align="right">Principal</TableCell>
                                        <TableCell align="right">Interest</TableCell>
                                        <TableCell align="right">Balance</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {results?.table?.map((row: any, index: number) => (
                                        <TableRow key={index}>
                                            <TableCell>{index + 1}</TableCell>
                                            <TableCell>{new Date(row.paymentDate).toLocaleDateString()}</TableCell>
                                            <TableCell align="right">${row.amount.toFixed(2)}</TableCell>
                                            <TableCell align="right">${row.principalPaid.toFixed(2)}</TableCell>
                                            <TableCell align="right">${row.interestPaid.toFixed(2)}</TableCell>
                                            <TableCell align="right">${row.remainingBalance.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
}
