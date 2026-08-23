import { useId, useState } from "react";
import * as ModelList from "../controller/llm/ModelList";
import * as Settings from "../controller/llm/Settings";
import { PROVIDERS, findProvider } from "../controller/llm/Providers";
import { t } from "../i18n";

type ChatSettingsArgs = {
  settings: Settings.Settings;
  onChange: (settings: Settings.Settings) => void;
};

const LABEL_CLASS = "text-xs text-zinc-400";

const FIELD_CLASS = `
  w-full px-2 py-1 rounded-md bg-zinc-900 text-zinc-100 text-sm
  border border-zinc-700 focus:border-blue-400 focus:outline-none
`;

/**
 * AI の接続設定
 *
 * 計算はユーザー自身のアカウントで行うため、キーはユーザーに用意してもらう。
 * ps88web にはサーバーが無く、キーはこのブラウザから接続先へ直接送られる
 */
export const ChatSettings = ({ settings, onChange }: ChatSettingsArgs) => {
  const provider = findProvider(settings.providerId);
  // いま選んでいる接続先への入力内容 (接続先を切り替えると中身も入れ替わる)
  const current = Settings.current(settings);
  const missingApiKey = provider.apiKeyURL !== "" && current.apiKey === "";
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  /**
   * 一覧があっても手で入力するか
   *
   * 一覧に出ないモデルが使えることがある (proxy 越しや、一覧を絞って返す
   * 接続先など)。一覧が取れたら選ぶだけで済ませたいが、入力の道は残す
   */
  const [typing, setTyping] = useState(false);
  const modelListId = useId();

  // 一覧から選べる状態か
  const selectable = models != null && models.length > 0 && !typing;

  const onProviderChange = (id: string) => {
    onChange({ ...settings, providerId: id });
    setModels(null);
    setModelsError(null);
    setTyping(false);
  };

  const onFetchModels = async () => {
    setFetching(true);
    setModelsError(null);
    try {
      setModels(await ModelList.listModels(Settings.toConnection(settings)));
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
          value={current.baseURL}
          onChange={(e) =>
            onChange(Settings.edit(settings, { baseURL: e.target.value }))
          }
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
            value={current.apiKey}
            onChange={(e) =>
              onChange(Settings.edit(settings, { apiKey: e.target.value }))
            }
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
          {selectable ? (
            <select
              id={`${modelListId}-model`}
              className={FIELD_CLASS}
              value={current.model}
              onChange={(e) =>
                onChange(Settings.edit(settings, { model: e.target.value }))
              }
            >
              {/* 未選択のまま開いたときに、先頭のモデルを選んだことに
                  ならないようにする */}
              {current.model === "" ? (
                <option value="">{t.settings.modelPick}</option>
              ) : null}
              {/* 一覧に無い名前が入っていても、選択に切り替えた拍子に
                  消えないようにする */}
              {current.model !== "" && !models.includes(current.model) ? (
                <option value={current.model}>{current.model}</option>
              ) : null}
              {models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${modelListId}-model`}
              className={FIELD_CLASS}
              list={modelListId}
              placeholder={t.settings.modelPlaceholder}
              value={current.model}
              onChange={(e) =>
                onChange(Settings.edit(settings, { model: e.target.value }))
              }
            />
          )}
          <button
            className="
              px-2 rounded-md bg-zinc-700 hover:bg-zinc-600 text-zinc-100
              text-sm whitespace-nowrap cursor-pointer
              disabled:text-zinc-500 disabled:cursor-not-allowed
              transition-all duration-150 ease-in-out
            "
            disabled={fetching || current.baseURL === "" || missingApiKey}
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
        {models != null && models.length > 0 ? (
          <button
            type="button"
            className="self-start text-xs text-sky-600 cursor-pointer"
            onClick={() => setTyping(!typing)}
          >
            {selectable ? t.settings.modelTypeIn : t.settings.modelFromList}
          </button>
        ) : null}
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
