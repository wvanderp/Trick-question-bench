# Output Directory

This directory contains the results of benchmark runs.

Each test generates:
- Grouped model result files: `{company}/{model}.json`
- A summary file: `summary.json`

Each model file contains a JSON array with all question/answer evaluations for that model.

Results are automatically saved here when you run `npm start`.
