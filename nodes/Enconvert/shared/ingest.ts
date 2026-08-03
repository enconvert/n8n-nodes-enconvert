import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
} from 'n8n-workflow';

import { attachOutputFile, fetchText } from './binary';
import { jobFailed, waitForJob, type WaitOptions } from './poll';
import { apiRequest } from './transport';

export type IngestOutputMode = 'chunks' | 'file' | 'job';

interface IngestJob extends IDataObject {
	job_id?: string;
	status?: string;
	output_url?: string;
	pages_discovered?: number;
	pages_processed?: number;
	pages_failed?: number;
	total_chunks?: number;
	error_message?: string;
	warnings?: string[];
}

/** One line of the JSONL EnConvert produces (services/v2_engine/markdown_jsonl.py). */
interface ChunkRecord {
	id?: string;
	content?: string;
	metadata?: {
		source_url?: string;
		title?: string;
		headings_path?: string[];
		section?: string;
		word_count?: number;
		chunk_index?: number;
	};
}

export const ingestOutputField: INodeProperties = {
	displayName: 'Output',
	name: 'ingestOutput',
	type: 'options',
	default: 'chunks',
	description: 'What to return once the job finishes',
	options: [
		{
			name: 'Chunks',
			value: 'chunks',
			description: 'One item per passage, ready to feed a Default Data Loader and a vector store',
		},
		{
			name: 'JSONL File',
			value: 'file',
			description: 'A single .jsonl file containing every passage',
		},
		{
			name: 'Job Details Only',
			value: 'job',
			description: 'Page and chunk counts plus a download link, without transferring the data',
		},
	],
};

export const chunkOptionFields: INodeProperties[] = [
	{
		displayName: 'Max Words per Chunk',
		name: 'chunkMaxWords',
		type: 'number',
		default: 512,
		typeOptions: { minValue: 32, maxValue: 4000 },
		description: 'Largest passage size. Smaller values retrieve more precisely but lose context.',
	},
	{
		displayName: 'Sentence Overlap',
		name: 'chunkSentenceOverlap',
		type: 'number',
		default: 1,
		typeOptions: { minValue: 0, maxValue: 10 },
		description: 'How many sentences each passage repeats from the one before it',
	},
];

export async function fetchIngestJob(
	this: IExecuteFunctions,
	jobId: string,
	itemIndex: number,
): Promise<IngestJob> {
	return (await apiRequest.call(
		this,
		'GET',
		`/v2/ingest/${encodeURIComponent(jobId)}`,
		undefined,
		undefined,
		itemIndex,
	)) as IngestJob;
}

/**
 * Wait for an ingest job if asked, then shape it into output items.
 * Shared by File > Split Into Chunks and Website > Crawl.
 */
export async function resolveIngestJob(
	this: IExecuteFunctions,
	submitted: IngestJob,
	outputMode: IngestOutputMode,
	wait: WaitOptions,
	itemIndex: number,
	binaryPropertyName = 'data',
): Promise<INodeExecutionData[]> {
	const jobId = submitted.job_id;
	if (!jobId) {
		return [{ json: submitted, pairedItem: { item: itemIndex } }];
	}

	if (!wait.waitForCompletion) {
		return [{ json: summarise(submitted), pairedItem: { item: itemIndex } }];
	}

	const job = (await waitForJob.call(
		this,
		jobId,
		async (id) => await fetchIngestJob.call(this, id, itemIndex),
		wait,
		itemIndex,
	)) as IngestJob;

	if (jobFailed(job)) {
		return [{ json: summarise(job), pairedItem: { item: itemIndex } }];
	}

	if (outputMode === 'job' || !job.output_url) {
		return [{ json: summarise(job), pairedItem: { item: itemIndex } }];
	}

	if (outputMode === 'file') {
		const binary = await attachOutputFile.call(
			this,
			job.output_url,
			`${jobId}.jsonl`,
			itemIndex,
			binaryPropertyName,
			'application/x-ndjson',
		);
		return [{ json: summarise(job), binary, pairedItem: { item: itemIndex } }];
	}

	const jsonl = await fetchText.call(this, job.output_url, itemIndex);
	const chunks = parseJsonl(jsonl);

	if (chunks.length === 0) {
		return [{ json: summarise(job), pairedItem: { item: itemIndex } }];
	}

	return chunks.map((chunk) => ({
		json: flattenChunk(chunk, jobId),
		pairedItem: { item: itemIndex },
	}));
}

function parseJsonl(text: string): ChunkRecord[] {
	const records: ChunkRecord[] = [];
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (trimmed === '') continue;
		try {
			records.push(JSON.parse(trimmed) as ChunkRecord);
		} catch {
			// A truncated final line is not worth failing the whole run over.
		}
	}
	return records;
}

function flattenChunk(chunk: ChunkRecord, jobId: string): IDataObject {
	const metadata = chunk.metadata ?? {};
	return {
		id: chunk.id,
		content: chunk.content ?? '',
		sourceUrl: metadata.source_url,
		title: metadata.title,
		headingsPath: metadata.headings_path ?? [],
		section: metadata.section,
		wordCount: metadata.word_count,
		chunkIndex: metadata.chunk_index,
		jobId,
	};
}

function summarise(job: IngestJob): IDataObject {
	const summary: IDataObject = {
		jobId: job.job_id,
		status: job.status,
		mode: job.mode,
		pagesDiscovered: job.pages_discovered,
		pagesProcessed: job.pages_processed,
		pagesFailed: job.pages_failed,
		totalChunks: job.total_chunks,
		createdAt: job.created_at,
		completedAt: job.completed_at,
	};
	if (job.output_url) {
		summary.downloadUrl = job.output_url;
		summary.downloadUrlExpiresInSeconds = 900;
	}
	if (job.error_message) summary.error = job.error_message;
	if (Array.isArray(job.warnings) && job.warnings.length > 0) summary.warnings = job.warnings;
	if (job.webhook_url) summary.webhookUrl = job.webhook_url;
	return summary;
}
