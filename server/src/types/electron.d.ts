// Electron adds resourcesPath to process when running in packaged mode
declare namespace NodeJS {
  interface Process {
    resourcesPath?: string;
  }
}
