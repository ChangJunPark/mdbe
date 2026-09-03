type TextFileHandle = {
  getFile(): Promise<{
    text(): Promise<string>
  }>
}

export class FileChangedOnDiskError extends Error {
  constructor() {
    super('The file changed on disk after it was opened in mdbe.')
    this.name = 'FileChangedOnDiskError'
  }
}

export async function assertFileMatchesBaseline(
  handle: TextFileHandle,
  expectedContent: string,
) {
  const currentFile = await handle.getFile()
  const currentContent = await currentFile.text()
  if (currentContent !== expectedContent) {
    throw new FileChangedOnDiskError()
  }
}
