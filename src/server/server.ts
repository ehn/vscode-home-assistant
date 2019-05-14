import { createConnection, TextDocuments, ProposedFeatures, ServerCapabilities } from "vscode-languageserver";
import { VsCodeFileAccessor } from "./fileAccessor";
import { HomeAssistantLanguageService } from "./haLanguageService";
import { HaConnection } from "./home-assistant/haConnection";
import { YamlLanguageServiceWrapper } from "./yamlLanguageServiceWrapper";
import { EntityIdCompletionContribution } from "./completionHelpers/entityIds";
import { ConfigurationService } from "./configuration";
import { ServicesCompletionContribution } from "./completionHelpers/services";
import { DefinitionProvider } from "./definition/definition";
import { IncludeDefinitionProvider } from "./definition/includes";
import { ScriptDefinitionProvider } from "./definition/scripts";
import { HomeAssistantConfiguration } from "./haConfig/haConfig";

let connection = createConnection(ProposedFeatures.all);

console.log = connection.console.log.bind(connection.console);
// console.error = connection.console.error.bind(connection.console);
console.warn = connection.window.showWarningMessage.bind(connection.window);
console.error = connection.window.showErrorMessage.bind(connection.window);

let documents = new TextDocuments();
documents.listen(connection);

connection.onInitialize(async params => {

  connection.console.log(`[Home Assistant Language Server(${process.pid})] Started and initialize received`);

  var configurationService = new ConfigurationService();
  var haConnection = new HaConnection(configurationService);
  var fileAccessor = new VsCodeFileAccessor(params.rootUri, connection, documents);
  var haConfig = new HomeAssistantConfiguration(fileAccessor);
  
  var definitionProviders = [
    new IncludeDefinitionProvider(fileAccessor),
    new ScriptDefinitionProvider(haConfig)
  ];

  var yamlLanguageServiceWrapper = new YamlLanguageServiceWrapper([
    new EntityIdCompletionContribution(haConnection),
    new ServicesCompletionContribution(haConnection)
  ]);

  var homeAsisstantLanguageService = new HomeAssistantLanguageService(
    documents,
    yamlLanguageServiceWrapper,
    haConfig,
    haConnection,
    definitionProviders
  );

  await haConfig.discoverFiles();
  await homeAsisstantLanguageService.findAndApplySchemas(connection);

  documents.onDidChangeContent((e) => homeAsisstantLanguageService.onDocumentChange(e, connection));
  documents.onDidOpen((e) => homeAsisstantLanguageService.onDocumentOpen(e, connection));
  documents.onDidSave((e) => homeAsisstantLanguageService.onDidSave(e, connection));

  connection.onDocumentSymbol(homeAsisstantLanguageService.onDocumentSymbol);
  connection.onDocumentFormatting(homeAsisstantLanguageService.onDocumentFormatting);
  connection.onCompletion(homeAsisstantLanguageService.onCompletion);
  connection.onCompletionResolve(homeAsisstantLanguageService.onCompletionResolve);
  connection.onHover(homeAsisstantLanguageService.onHover);
  connection.onDefinition(homeAsisstantLanguageService.onDefinition);

  connection.onDidChangeConfiguration(async (config) => {
    configurationService.updateConfiguration(config);
    await haConnection.notifyConfigUpdate();

    if (!configurationService.isConfigured) {
      connection.sendNotification("no-config");
    }
  });

  return {
    capabilities: <ServerCapabilities>{
      textDocumentSync: documents.syncKind,
      completionProvider: { triggerCharacters: [" "], resolveProvider: true },
      hoverProvider: true,
      documentSymbolProvider: true,
      documentFormattingProvider: true,
      definitionProvider: true
    }
  };
});

connection.listen();
