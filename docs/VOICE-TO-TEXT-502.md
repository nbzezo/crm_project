# Ghi âm → văn bản: sự cố 502 và các bản vá

Ghi lại lần xử lý ngày 18/09/2026, chủ yếu để lần sau không phải dò lại từ đầu. Ba commit:
`a5c9992`, `cda1022`, `56f70c2`.

## Triệu chứng

`POST /api/ai/assist/voice-note/convert` trả 502. Console trình duyệt chỉ hiện đúng một dòng
`Failed to load resource: the server responded with a status of 502`, không kèm thông tin nào khác.

## Vì sao 502 không nói lên điều gì

`asHttpError` trong `routes/ai.ts` gộp **mọi** `AiProviderError` không phải `not_configured`, quota,
401 hay 403 thành đúng một mã 502. Nghĩa là timeout, mất mạng, provider trả 4xx/5xx, thiếu năng lực
model, không hỗ trợ đính kèm — tất cả ra ngoài giống hệt nhau.

Cần phân biệt ngay từ đầu **502 do ai trả**:

| Nguồn | Nhận biết | Ý nghĩa |
| --- | --- | --- |
| Ứng dụng | Body là JSON có trường `error` tiếng Việt | Một `AiProviderError` cụ thể, đọc `error_code` để biết |
| nginx | Body là HTML `<center>nginx</center>` | Tiến trình Node chết hoặc từ chối kết nối |

Nếu chỉ *chậm*, nginx trả **504** chứ không phải 502 — nên 502-từ-nginx luôn có nghĩa là app đã chết.

## Nguyên nhân thật

`ai_usage_logs` đã ghi `error_code` cho từng lần chạy từ trước, nhưng bảng usage trong UI không
render cột đó, nên không ai nhìn thấy. Sau khi hiện lên:

```
11:39  voice_note_convert  9router · openclaw-pc-mpt          error · attachment_unsupported
11:37  voice_note_convert  9router · ag/gemini-3.7-flash-…    error · attachment_unsupported
10:53  voice_note_convert  ·                                  error · capability_missing
08:53  voice_note_convert  ·                                  error · capability_missing
```

Gốc rễ: **`generateOpenAiCompatible` chưa bao giờ serialize attachment** — nó chỉ ghép `system` và
`prompt` thành text. Vì thế `generateWithProvider` có một dòng chặn cứng, hễ có đính kèm mà provider
là 9Router hoặc DeepSeek thì từ chối ngay.

Và vì 9Router là nhà cung cấp duy nhất được cấu hình, hai giai đoạn log khớp chính xác:

- **`capability_missing`** (cột provider trống): chế độ tự động, không model nào được đánh dấu
  `audioInput` nên gateway loại hết trước khi gọi.
- **`attachment_unsupported`**: sau khi ghim model thủ công, qua được cửa năng lực nhưng đâm vào
  dòng chặn cứng.

## Các bản vá

| Vấn đề | Sửa ở |
| --- | --- |
| Không gửi được đính kèm qua provider OpenAI-compatible | `services/ai/providers.ts` — `openAiAttachmentPart` |
| Lỗi thật bị lý do bỏ qua của provider kế tiếp ghi đè | `services/ai/gateway.ts` — tách `attemptError` / `skipError` |
| `request.model` gán cho mọi provider trong vòng fallback | `services/ai/gateway.ts` — `modelFor` |
| Timeout 45s cứng, không đủ để đọc bản ghi vài phút | `services/ai/providers.ts` + `AiRunRequest.timeoutMs` |
| nginx chặn body > 1MB, timeout ngắn hơn phía app | `nginx.conf` |
| nginx không nhận config mới sau deploy | `.github/workflows/deploy.yml` |
| Tệp vượt giới hạn inline của Gemini báo lỗi khó hiểu | `routes/ai.ts` — `MAX_INLINE_AUDIO_BYTES` |
| `error_code` không hiện trong bảng usage | `pages/AiWorkspacePage.tsx` |

Ba chi tiết đáng nhớ:

**Lỗi che lỗi.** Vòng fallback trong `gateway.ts` dùng chung một biến `lastError` cho hai thứ khác
hẳn nhau: lý do *bỏ qua* một provider trước khi gọi (thiếu năng lực, hết quota) và lỗi của một lần
gọi *thật*. Provider bị bỏ qua luôn đứng sau nên ghi đè lên lỗi thật — một lần Gemini timeout nổi
lên giao diện thành `Model ... không đọc được tệp đính kèm`, sai hoàn toàn nguyên nhân. Giờ hai loại
được giữ riêng, lỗi của lần gọi thật luôn thắng.

**`format` của `input_audio` là tên định dạng, không phải mime.** `audio/webm;codecs=opus` phải gửi
thành `webm`. Request không có đính kèm vẫn giữ `content` dạng chuỗi trần vì một số máy chủ
OpenAI-compatible cũ từ chối dạng mảng.

**Bind-mount một tệp đơn gắn vào inode, không phải đường dẫn.** Bước `rsync` trong deploy ghi file
tạm rồi `rename` đè lên `nginx.conf`, sinh inode mới; container đang chạy vẫn đọc inode cũ. Cả
`nginx -s reload` lẫn `docker compose restart nginx` đều vô ích — chỉ `--force-recreate` mới gắn lại
mount. Triệu chứng: sửa `nginx.conf`, deploy xong, mọi thứ vẫn y nguyên.

## Cấu hình model cho speech-to-text

Cài đặt → AI → panel **Ghi âm → văn bản**. Lưu ở `app_settings` key `ai.voice_model`, endpoint
`GET/PUT /api/ai/voice-model`.

- **Tự động**: gateway lọc theo năng lực `audioInput` và tự chọn nhà cung cấp đầu tiên đọc được.
- **Chọn tay**: gateway **ghim cứng** provider + model — không fallback, **không lọc theo bảng năng
  lực**. Bảng năng lực chỉ suy đoán từ tên model nên từng chặn nhầm model đọc được audio; khi người
  dùng chọn có chủ đích thì tin lựa chọn đó.

Bảng năng lực được lưu lúc đồng bộ model, nên sau khi đổi logic suy đoán phải bấm **Đồng bộ model**
lại thì mới có hiệu lực.

## Chẩn đoán lần sau

Đọc `error_code` trong bảng usage ở trang Trợ lý AI, hoặc gọi thẳng API:

```js
fetch('/api/ai/usage')
  .then((r) => r.json())
  .then((d) => console.table(d.recent.filter((x) => x.task === 'voice_note_convert')));
```

| `error_code` | Việc cần làm |
| --- | --- |
| `timeout` | Bản ghi quá dài so với `VOICE_CONVERT_TIMEOUT_MS`; chia ngắn hoặc nâng hạn giờ |
| `capability_missing` | Chưa đồng bộ model, hoặc không model nào đọc được audio — chọn model thủ công |
| `attachment_unsupported` | Provider không có đường gửi tệp (hiện chỉ còn DeepSeek) |
| `provider_413` / `provider_400` | Tệp quá lớn hoặc định dạng upstream không nhận |
| `provider_429` | Hết quota phía nhà cung cấp |
| `all_providers_failed` | Không provider nào có model hợp lệ cho `mode` đang yêu cầu |
| *không có dòng nào* | 502 đến từ nginx — xem `docker compose logs app` |

Kiểm tra nginx đã nhận config mới chưa:

```bash
head -c 2000000 /dev/zero > /tmp/2mb.bin
curl -s -o /dev/null -w "%{http_code}\n" -X POST --data-binary @/tmp/2mb.bin http://<host>/api/__probe__
```

`413` là config cũ, `401` là config mới (request lọt qua proxy tới app, app từ chối vì chưa đăng nhập).

## Giới hạn còn lại

- Một lần chuyển tối đa **18 MB** (`MAX_INLINE_AUDIO_BYTES`), do Gemini giới hạn ~20 MB cho toàn bộ
  request chứa `inline_data`. Muốn bỏ trần này phải chuyển sang Gemini Files API thay vì gửi inline.
- Bản ghi từ trình duyệt là `audio/webm;codecs=opus`. Spec gốc của OpenAI chỉ cho `input_audio` với
  `wav` và `mp3`; router nào validate chặt theo spec sẽ từ chối webm. Khi đó lỗi hiện ra là
  `provider_400` kèm thông báo cụ thể của router, và đường chắc ăn là cấu hình thẳng nhà cung cấp
  Gemini — API gốc của Gemini nhận webm/opus qua `inline_data` không cần chuyển đổi.
