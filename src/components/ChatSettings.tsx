import { useId, useState } from "react";
import * as Client from "../controller/llm/Client";
import * as Settings from "../controller/llm/Settings";
import { PROVIDERS, findProvider } from "../controller/llm/Providers";
import { t } from "../i18n";

type ChatSettingsArgs = {
  settings: Settings.Settings;
  onChange: (settings: Settings.Settings) => void;
};

const FIELD_CLASS = `
  w-full px-2 py-1 rounded-md bg-zinc-900 text-zinc-100 text-sm
  border border-zinc-700 focus:border-blue-400 focus:outline-none
`;

const LABEL_CLASS = "text-xs text-zinc-400";

/**
 * AI の接続設定
 *
 * 計算はユーザー自身のアカウントで行うため、キーはユーザーに用意してもらう。
 * ps88web にはサーバーが無く、キーはこのブラウザから接続先へ直接送られる
 */
export const ChatSettings = ({ settings, onChange }: ChatSettingsArgs) => {
  const provider = findProvider(settings.providerId);
  // キーが要る接続先でキーが空のまま一覧を引くと、接続先ごとにばらばらの
  // 分かりにくいエラーが返る (Gemini は 404 など)。先にボタンを止めておく
  const missingApiKey = provider.apiKeyURL !== "" && settings.apiKey === "";
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const modelListId = useId();

  const onProviderChange = (id: string) => {
    // エンドポイントもキーもモデルも接続先ごとに別物のため入れ替える。
    // 以前その接続先に入力した内容があれば Settings 側が戻してくれる
    onChange(Settings.withProvider(settings, id));
    setModels(null);
    setModelsError(null);
  };

  const onFetchModels = async () => {
    setFetching(true);
    setModelsError(null);
    try {
      setModels(await Client.listModels(Settings.toConnection(settings)));
    } catch (e) {
      // 一覧を出せない接続先もある。その場合も手で入力すれば使えるため、
      // 失敗を伝えるだけにして入力欄は塞がない
      setModelsError(e instanceof Error ? e.message : String(e));
      setModels(null);
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3 border-b border-zinc-700">
      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor={`${modelListId}-provider`}>
          {t.settings.provider}
        </label>
        <select
          id={`${modelListId}-provider`}
          className={FIELD_CLASS}
          value={settings.providerId}
          onChange={(e) => onProviderChange(e.target.value)}
        >
          {PROVIDERS.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
        {provider.note != undefined ? (
          <p className="text-xs text-zinc-500">{provider.note}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor={`${modelListId}-url`}>
          {t.settings.endpoint}
        </label>
        <input
          id={`${modelListId}-url`}
          className={FIELD_CLASS}
          type="url"
          placeholder="https://..."
          value={settings.baseURL}
          onChange={(e) => onChange({ ...settings, baseURL: e.target.value })}
        />
      </div>

      {provider.apiKeyURL !== "" ? (
        <div className="flex flex-col gap-1">
          <label className={LABEL_CLASS} htmlFor={`${modelListId}-key`}>
            {t.settings.apiKey}
          </label>
          <input
            id={`${modelListId}-key`}
            className={FIELD_CLASS}
            type="password"
            autoComplete="off"
            placeholder="sk-..."
            value={settings.apiKey}
            onChange={(e) => onChange({ ...settings, apiKey: e.target.value })}
          />
          <a
            className="text-xs text-sky-600"
            href={provider.apiKeyURL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t.settings.getApiKey}
          </a>
          {/* 月額プランを契約していれば使えると誤解されやすいため先に断る。
              API の課金は各プランとは別枠になっている */}
          <p className="text-xs text-zinc-500">{t.settings.subscriptionNote}</p>
          <label className="flex flex-row gap-2 items-center text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={settings.rememberApiKey}
              onChange={(e) =>
                onChange({ ...settings, rememberApiKey: e.target.checked })
              }
            />
            {t.settings.rememberApiKey}
          </label>
        </div>
      ) : null}

      <div className="flex flex-col gap-1">
        <label className={LABEL_CLASS} htmlFor={`${modelListId}-model`}>
          {t.settings.model}
        </label>
        <div className="flex flex-row gap-2">
          <input
            id={`${modelListId}-model`}
            className={FIELD_CLASS}
            list={modelListId}
            placeholder={t.settings.modelPlaceholder}
            value={settings.model}
            onChange={(e) => onChange({ ...settings, model: e.target.value })}
          />
          <button
            className="
              px-2 rounded-md bg-zinc-700 hover:bg-zinc-600 text-zinc-100
              text-sm whitespace-nowrap cursor-pointer
              disabled:text-zinc-500 disabled:cursor-not-allowed
              transition-all duration-150 ease-in-out
            "
            disabled={fetching || settings.baseURL === "" || missingApiKey}
            title={missingApiKey ? t.settings.apiKeyFirst : undefined}
            onClick={() => void onFetchModels()}
          >
            {fetching ? t.settings.fetchingModels : t.settings.fetchModels}
          </button>
        </div>
        {/* モデル名は増減が激しいので、接続先から取得して補完に使う */}
        <datalist id={modelListId}>
          {(models ?? []).map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
        {modelsError != null ? (
          <p className="text-xs text-red-400">
            {t.settings.modelsFailed(modelsError)}
          </p>
        ) : null}
      </div>

      <p className="text-xs text-zinc-500">{t.settings.keyNote}</p>
    </div>
  );
};
