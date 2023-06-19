import { Router } from 'express';
import { EndpointContext } from '../types';
import { withTempDir } from '../util';
import path from 'path';
import { invokeParser } from '../machines/parser.service';

export function parserFileValidation(app: Router, context: EndpointContext) {
	app.post<{ parserName: string }, any, Express.Request>('/parser/:parserName/validate-files', async (req, res) => {
		const { parserName } = req.params;
		const parser = context.parserInfo[parserName];
		if (!parser) return res.status(400).send({ msg: `Parser ${parserName} is not available` });
		if (!req.files) return res.status(500).send({ msg: 'No files provided' });
		const files = !Array.isArray(req.files.file) ? [req.files.file] : req.files.file;

		const validated = await withTempDir(async (dir) => {
			const rootDir = files[0].name.replace(/:/gi, '/').split('/');
			await Promise.allSettled(files.map((file) => file.mv(path.join(dir, file.name.replace(/:/gi, '/')))));
			return await invokeParser(parserName, [
				'validate-files',
				'--folder',
				path.join(dir, rootDir[0]).replace(/(\s+)/g, '\\$1'),
			]);
		});
		return res.send(validated);
	});
}