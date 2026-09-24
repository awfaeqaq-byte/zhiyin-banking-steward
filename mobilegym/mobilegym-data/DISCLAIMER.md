# Disclaimer / 免责声明

This document applies to the mobilegym-data dataset package.
本声明适用于 mobilegym-data 数据包。

---

## English

mobilegym-data is the dataset companion to the mobile-gym research
environment, a platform for **training and evaluating** vision-language
agents that operate mobile user interfaces. This package contains
synthetic content authored by the maintainers, content collected
through official developer APIs of third-party platforms, and visual
assets used to render simulated UIs.

### No affiliation

The maintainers are NOT affiliated with, endorsed by, sponsored by, or
in any way officially connected to the companies, platforms, or
designers whose products may be referenced or whose visual idioms may
appear in this package.

### Trademarks

All product names, logos, and trademarks are the property of their
respective owners and are referenced only for nominative purposes —
to identify which real-world application a given asset is intended to
populate within the mobile-gym environment, and to enable reproducible
academic research.

### Data provenance

All data shipped in this package falls into one of two categories:

(a) **Fully synthetic or AI-generated** — produced by the maintainers
    or by generative models, with no correspondence to any real user,
    post, or piece of content on any third-party platform; or

(b) **Collected through official developer APIs** of the relevant
    platforms, under the access terms in effect at the time of
    collection, limited to content that was publicly visible via those
    APIs, and processed to remove or pseudonymize personally
    identifying information where practicable.

In addition, this package includes visual assets used to render
simulated UIs (icons, wallpapers, theme components, fonts, and
similar). For any such asset that originates from a third-party theme
store, designer, or device manufacturer, copyright remains with the
original creator. The maintainers make no ownership claim and include
the assets only to the extent permitted by applicable academic research
/ fair use / fair dealing exceptions, for non-commercial academic
research purposes.

The dataset compilation and the maintainers' synthetic contributions
are licensed under CC BY-NC 4.0; see LICENSE.

### No model training on platform content

The data in this package is provided solely as **environment content**
for the mobile-gym simulator. It is NOT, and is not intended to be:

- a training corpus for language-model pre-training, fine-tuning, or
  instruction tuning;
- a training signal for any generative model that targets reproduction
  of the underlying user-generated content;
- redistributed for the purpose of building or improving generative
  models on the underlying platform content.

The maintainers have not used, and do not use, this data to train any
machine learning model. Where users employ this data within mobile-gym
for downstream agent training (e.g., reinforcement learning over
trajectories collected inside the simulated UIs), they are responsible
for ensuring that their own training procedure complies with each
relevant platform's developer terms regarding the use of platform
content for AI / ML.

### Takedown

If you are a rights holder and believe that any content in this package
infringes your rights, please open an issue on the mobile-gym code
repository or contact the maintainers. We will review and remove or
modify the relevant content promptly.

---

## 中文

mobilegym-data 是 mobile-gym 研究环境的配套数据包。mobile-gym 是用于
**训练和评测**手机操作 Agent（视觉语言模型驱动）的研究环境。本包含
维护者制作的合成内容、通过相关平台官方开发者接口采集的内容，以及用于
渲染模拟 UI 的视觉素材。

### 无关联声明

维护者与本包中可能引用或视觉风格上有所参照的任何公司、平台或设计者
**不存在任何附属、代言、赞助或官方合作关系**。

### 商标归属

所有产品名称、标识、商标均归各自权利人所有。本包仅在指示性合理使用的
范围内提及这些名称，目的是说明某项素材所对应的真实应用，并保证学术
研究的可复现性。

### 数据来源

本包中的数据均属以下两类之一：

（一）**完全为合成数据或 AI 生成内容**：由维护者制作或由生成式模型
     生产，与任何第三方平台上的真实用户、帖子或作品**不存在对应
     关系**；

（二）**通过相关平台的官方开发者接口采集**：遵循采集当时有效的访问
     条款，仅限官方接口返回的、当时公开可见的内容，并已尽合理可能
     去除或假名化可识别个人身份的信息。

此外，本包还含有用于渲染模拟 UI 的视觉素材（图标、壁纸、主题组件、
字体等）。对于其中来源于第三方主题商店、设计者或设备厂商的素材，
**版权仍归其原创作者所有**。维护者**不主张任何所有权**，仅在适用的
学术研究 / 合理使用 / 合理处理例外允许的范围内，**为非商业学术研究
目的**而收录。

数据集的整理与维护者原创的合成内容采用 CC BY-NC 4.0 授权，详见
LICENSE。

### 不基于平台内容训练模型

本包中的数据仅作为 mobile-gym 模拟器的**环境内容**提供。它**不是、
也不意图作为**：

- 语言模型预训练、微调或指令微调的训练语料；
- 以再现原始用户产生内容为目标的生成式模型训练信号；
- 用于构建或改进基于上述平台内容的生成式模型而再分发的语料。

维护者**未曾、也不会**使用本数据训练任何机器学习模型。若使用者在
mobile-gym 中将本数据用于下游 Agent 训练（例如基于在模拟 UI 内采集
的交互轨迹开展强化学习），应自行确保其训练流程符合相关平台关于将
平台内容用于 AI / ML 的开发者条款。

### 侵权处理

若您是权利人，并认为本包中的某些内容侵犯了您的合法权益，请在
mobile-gym 代码仓库提交 Issue 或邮件联系维护者。我们将及时审阅并
删除或修改相关内容。
