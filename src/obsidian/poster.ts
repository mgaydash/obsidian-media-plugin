/**
 * Poster resizing with an HTML canvas. This replaces Pillow from the CLI and
 * works on desktop and mobile.
 */

function drawScaled(
	source: CanvasImageSource,
	width: number,
	height: number,
): HTMLCanvasElement {
	const canvas = createEl('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas is not available');
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	// White background so transparent images become a clean JPEG, as the CLI does.
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, width, height);
	ctx.drawImage(source, 0, 0, width, height);
	return canvas;
}

/**
 * Resize an image to `width` pixels wide, keeping its aspect ratio, and
 * encode it as JPEG at quality 0.85.
 */
export async function resizeToJpeg(
	data: ArrayBuffer,
	width: number,
): Promise<ArrayBuffer> {
	const bitmap = await createImageBitmap(new Blob([data]));
	try {
		const targetHeight = Math.max(
			1,
			Math.floor((width * bitmap.height) / bitmap.width),
		);

		// Halve the size in steps first: one big jump looks jagged in some browsers.
		let source: CanvasImageSource = bitmap;
		let w = bitmap.width;
		let h = bitmap.height;
		while (w / 2 >= width) {
			w = Math.floor(w / 2);
			h = Math.floor(h / 2);
			source = drawScaled(source, w, h);
		}
		const canvas = drawScaled(source, width, targetHeight);

		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				(b) => (b ? resolve(b) : reject(new Error('Could not encode JPEG'))),
				'image/jpeg',
				0.85,
			);
		});
		return await blob.arrayBuffer();
	} finally {
		bitmap.close();
	}
}
