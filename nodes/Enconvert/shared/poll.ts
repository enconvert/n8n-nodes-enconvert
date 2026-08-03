import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
// `sleep` comes from n8n-workflow because setTimeout/setInterval are banned
// globals for community nodes (lint: no-restricted-globals).
import { NodeApiError, sleep } from 'n8n-workflow';

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'canceled', 'partial', 'success']);

export interface WaitOptions {
	/** Poll until the job settles. When false the job id is returned as-is. */
	waitForCompletion: boolean;
	/** Ceiling in seconds. Kept well under n8n Cloud's 300s execution cancel. */
	maxWaitSeconds: number;
	pollIntervalSeconds: number;
}

export const DEFAULT_WAIT_OPTIONS: WaitOptions = {
	waitForCompletion: true,
	maxWaitSeconds: 120,
	pollIntervalSeconds: 3,
};

export function readWaitOptions(
	this: IExecuteFunctions,
	itemIndex: number,
	optionsParameter = 'options',
): WaitOptions {
	const options = this.getNodeParameter(optionsParameter, itemIndex, {}) as IDataObject;
	return {
		waitForCompletion:
			(options.waitForCompletion as boolean | undefined) ?? DEFAULT_WAIT_OPTIONS.waitForCompletion,
		maxWaitSeconds:
			(options.maxWaitSeconds as number | undefined) ?? DEFAULT_WAIT_OPTIONS.maxWaitSeconds,
		pollIntervalSeconds:
			(options.pollIntervalSeconds as number | undefined) ??
			DEFAULT_WAIT_OPTIONS.pollIntervalSeconds,
	};
}

/**
 * Poll a job until it reaches a terminal status.
 *
 * On timeout the error carries the job id, so the run is resumable with the
 * Job > Get operation instead of the work being silently lost.
 */
export async function waitForJob(
	this: IExecuteFunctions,
	jobId: string,
	fetchStatus: (jobId: string) => Promise<IDataObject>,
	options: WaitOptions,
	itemIndex: number,
): Promise<IDataObject> {
	const deadline = options.maxWaitSeconds * 1000;
	const interval = Math.max(1, options.pollIntervalSeconds) * 1000;
	let elapsed = 0;
	let latest = await fetchStatus(jobId);

	while (!isTerminal(latest)) {
		if (elapsed >= deadline) {
			throw new NodeApiError(this.getNode(), latest as never, {
				message: `EnConvert job is still running after ${options.maxWaitSeconds}s`,
				description: `The job was not lost. Retrieve it later with the Job > Get operation using ID "${jobId}", or raise Max Wait Time on this node.`,
				itemIndex,
			});
		}
		await sleep(interval);
		elapsed += interval;
		latest = await fetchStatus(jobId);
	}

	return latest;
}

function isTerminal(job: IDataObject): boolean {
	const status = typeof job.status === 'string' ? job.status.toLowerCase() : '';
	return TERMINAL_STATUSES.has(status);
}

/** True when a settled job did not produce a usable result. */
export function jobFailed(job: IDataObject): boolean {
	const status = typeof job.status === 'string' ? job.status.toLowerCase() : '';
	return status === 'failed' || status === 'canceled';
}
