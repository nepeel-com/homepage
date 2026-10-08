import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  Heart,
  ImageOff,
  Menu,
  Plus,
  ScanLine,
  ShieldCheck,
  X,
} from "lucide-react";

const photos = [
  {
    src: "/images/street-style.webp",
    alt: "어두운 배경 앞에서 머리카락을 넘기는 사람의 인물 사진",
    title: "오늘의 나, 이대로.",
    category: "일상",
    place: "A LITTLE EVERYDAY",
    frame: "001",
    source: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1",
  },
  {
    src: "/images/ocean.webp",
    alt: "노을빛 하늘 아래 잔잔한 파도가 밀려오는 모래사장",
    title: "잠깐, 여름에 다녀왔어.",
    category: "여행",
    place: "SOMEWHERE SUNNY",
    frame: "002",
    source: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
  },
  {
    src: "/images/concert.webp",
    alt: "빛이 가득한 공연장에서 함께 음악을 즐기는 사람들",
    title: "이 밤의 볼륨은 최대로.",
    category: "함께",
    place: "AFTER DARK",
    frame: "003",
    source: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3",
  },
  {
    src: "/images/roadtrip.webp",
    alt: "붉은 암석 사이로 길게 이어진 사막의 도로",
    title: "계획에 없던 풍경.",
    category: "여행",
    place: "OFF THE MAP",
    frame: "004",
    source: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
  },
];

const steps = [
  {
    title: "카메라를 열고.",
    body: "갤러리에서 고르는 대신, 지금 눈앞에 있는 순간을 담아요.",
    label: "OPEN YOUR CAMERA",
    icon: Camera,
  },
  {
    title: "지금의 순간을 찍고.",
    body: "조금 흔들려도 괜찮아요. 완벽한 이미지보다 내가 보낸 시간이니까.",
    label: "CAPTURE THE MOMENT",
    icon: ScanLine,
  },
  {
    title: "진짜 우리와 연결돼요.",
    body: "앱에서 직접 찍은 사진만 모이는 피드. 서로의 오늘을 만나보세요.",
    label: "SHARE YOUR REAL LIFE",
    icon: Heart,
  },
];

const faqs = [
  {
    q: "nepeel은 어떤 SNS인가요?",
    a: "nepeel은 앱 안의 카메라로 직접 찍은 사진만 공유하는 SNS를 만들고 있습니다. 누구나 그럴듯한 이미지를 만들 수 있는 시대에, 우리가 직접 보고 경험한 순간으로 연결되는 공간을 지향합니다.",
  },
  {
    q: "갤러리에 있는 사진은 올릴 수 없나요?",
    a: "네. nepeel의 핵심 원칙은 앱 내 촬영입니다. 외부 파일이나 갤러리 사진을 가져오는 업로드 경로를 제공하지 않는 방식으로, 직접 찍은 순간이 피드의 출발점이 되도록 합니다.",
  },
  {
    q: "AI 이미지는 어떻게 막나요?",
    a: "AI 이미지를 판별해서 걸러내기보다, 외부 이미지가 들어오는 경로를 제한하는 것이 출발점입니다. 앱 내 촬영과 촬영 출처 확인을 중심으로 설계합니다. 다만 화면 재촬영 등 모든 우회 방식의 완벽한 차단을 보장하는 것은 아니며, 이 웹사이트의 체험은 서비스 흐름을 보여주는 샘플입니다.",
  },
  {
    q: "지금 앱을 사용할 수 있나요?",
    a: "nepeel 앱은 현재 출시 준비 중입니다. 아직 다운로드하거나 가입할 수 없으며, 출시 일정은 확정되는 대로 이 사이트에서 안내할 예정입니다. 지금은 서비스 소개와 샘플 미리보기를 만나보실 수 있습니다.",
  },
];

function Brand({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand ${large ? "brand-large" : ""}`}>
      nepeel
      <span className="brand-dot" />
    </span>
  );
}

function Stamp() {
  return (
    <div className="real-stamp" aria-label="No AI. Just real life.">
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <defs>
          <path
            id="stamp-circle"
            d="M70,70m-51,0a51,51 0 1,1 102,0a51,51 0 1,1 -102,0"
          />
        </defs>
        <text>
          <textPath href="#stamp-circle" textLength="316">
            NO AI. JUST REAL LIFE. • NO AI. JUST REAL LIFE. •{" "}
          </textPath>
        </text>
      </svg>
      <span className="stamp-star">✳</span>
    </div>
  );
}

function Experience({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const nextAction = useRef<HTMLButtonElement>(null);
  const [stage, setStage] = useState<"camera" | "review" | "shared">("camera");
  const [scene, setScene] = useState(1);
  const [flash, setFlash] = useState(false);
  const [liked, setLiked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setStage("camera");
      setLiked(false);
      setFlash(false);
      dialog.current?.showModal();
      const before = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = before;
        clearTimeout(timer.current);
      };
    }
    dialog.current?.close();
  }, [open]);

  useEffect(() => {
    if (open && stage !== "camera") nextAction.current?.focus();
  }, [stage, open]);

  function capture() {
    setFlash(true);
    timer.current = setTimeout(() => {
      setFlash(false);
      setStage("review");
    }, 240);
  }

  return (
    <dialog
      ref={dialog}
      className="experience-dialog"
      aria-labelledby="experience-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="experience-content">
        <div className="dialog-header">
          <span className="eyebrow">A LITTLE PREVIEW</span>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="체험 닫기"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <h2 id="experience-title">
          {stage === "camera"
            ? "지금, 이 순간."
            : stage === "review"
              ? "완벽하지 않아도, 좋아."
              : "우리의 순간이 되었어요."}
        </h2>
        <p className="dialog-description">
          앱 출시 준비 중 · 샘플 사진으로 보는 촬영·공유 흐름
        </p>
        <div className={`demo-photo ${flash ? "flash" : ""}`}>
          <img src={photos[scene].src} alt={photos[scene].alt} />
          {stage === "camera" && (
            <>
              <div className="viewfinder" />
              <span className="camera-indicator">
                <span /> SAMPLE CAMERA
              </span>
              <span className="camera-zoom">1×</span>
            </>
          )}
          {stage === "review" && (
            <span className="photo-status">
              <Check aria-hidden="true" size={15} /> 샘플 촬영 완료
            </span>
          )}
          {stage === "shared" && (
            <div className="shared-caption">
              <span>{photos[scene].title}</span>
              <button
                aria-label={liked ? "좋아요 취소" : "좋아요"}
                aria-pressed={liked}
                onClick={() => setLiked(!liked)}
                className={liked ? "liked" : ""}
              >
                <Heart
                  aria-hidden="true"
                  fill={liked ? "currentColor" : "none"}
                />
              </button>
            </div>
          )}
        </div>
        <div className="demo-controls">
          {stage === "camera" ? (
            <>
              <button
                className="text-button"
                onClick={() => setScene((scene + 1) % photos.length)}
                disabled={flash}
              >
                다른 장면 <ArrowRight aria-hidden="true" size={16} />
              </button>
              <button
                className="shutter"
                aria-label="샘플 사진 촬영"
                onClick={capture}
                disabled={flash}
              >
                <span />
              </button>
              <span className="mono">
                {String(scene + 1).padStart(2, "0")} / 04
              </span>
            </>
          ) : stage === "review" ? (
            <>
              <button
                className="text-button"
                onClick={() => setStage("camera")}
              >
                <ArrowLeft aria-hidden="true" size={16} /> 다시 찍기
              </button>
              <button
                className="button button-lime"
                ref={nextAction}
                onClick={() => setStage("shared")}
              >
                체험 피드에 공유 <ArrowUpRight aria-hidden="true" size={17} />
              </button>
            </>
          ) : (
            <>
              <span className="demo-success" role="status">
                <CheckCheck aria-hidden="true" size={18} /> 체험 피드에 담았어요
              </span>
              <button
                className="text-button"
                ref={nextAction}
                onClick={() => setStage("camera")}
              >
                다시 체험 <ArrowRight aria-hidden="true" size={16} />
              </button>
            </>
          )}
        </div>
        <p className="demo-note">
          이 체험은 샘플 화면입니다. 실제 촬영·업로드는 이루어지지 않으며 사진은
          저장되지 않습니다.
        </p>
      </div>
    </dialog>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [experienceOpen, setExperienceOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [filter, setFilter] = useState("전체");
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const photoDialog = useRef<HTMLDialogElement>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 },
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (selectedPhoto !== null) {
      photoDialog.current?.showModal();
      const before = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = before;
      };
    }
    photoDialog.current?.close();
  }, [selectedPhoto]);

  const openExperience = () => {
    setMenuOpen(false);
    setExperienceOpen(true);
  };

  return (
    <>
      <a className="skip-link" href="#main">
        본문으로 바로가기
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="home-link" href="#" aria-label="nepeel 홈">
            <Brand />
          </a>
          <nav className="desktop-nav" aria-label="메인 메뉴">
            <a href="#about">우리가 믿는 것</a>
            <a href="#how-it-works">nepeel의 방식</a>
            <a href="#moments">
              진짜의 순간들 <span>↗</span>
            </a>
          </nav>
          <a
            className="button button-dark header-cta"
            href="#launch"
          >
            앱 출시 준비 중 <ArrowDown aria-hidden="true" size={17} />
          </a>
          <button
            className="menu-toggle icon-button"
            aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
        {menuOpen && (
          <nav id="mobile-nav" className="mobile-nav" aria-label="모바일 메뉴">
            <a href="#about" onClick={() => setMenuOpen(false)}>
              우리가 믿는 것
            </a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
              nepeel의 방식
            </a>
            <a href="#moments" onClick={() => setMenuOpen(false)}>
              진짜의 순간들
            </a>
            <a
              className="button button-dark"
              href="#launch"
              onClick={() => setMenuOpen(false)}
            >
              앱 출시 준비 중 <ArrowDown aria-hidden="true" size={18} />
            </a>
          </nav>
        )}
      </header>

      <main id="main">
        <section className="hero shell" aria-labelledby="hero-title">
          <div className="hero-topline">
            <span className="eyebrow">
              <span className="live-dot" /> COMING SOON / 앱 출시 준비 중
            </span>
            <span className="mono hero-edition">
              THE CAMERA-ONLY SOCIAL CLUB
            </span>
          </div>
          <div className="hero-main">
            <div className="hero-copy">
              <h1 id="hero-title">
                LESS FAKE.
                <br />
                <span className="more-line">
                  MORE{" "}
                  <span className="life-word">
                    LIFE
                    <svg
                      viewBox="0 0 280 30"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path d="M5 17C62 2 206 0 274 9M18 27C103 10 207 12 258 14" />
                    </svg>
                  </span>
                  <span className="lime-period">.</span>
                </span>
              </h1>
              <div className="hero-message">
                <h2>
                  만들어진 세상 말고,
                  <br />
                  네가 사는 세상.
                </h2>
                <p>
                  AI 이미지도, 갤러리 업로드도 없이.
                  <br />
                  오직 직접 찍은 순간으로 연결되는 우리.
                </p>
              </div>
              <div className="hero-actions">
                <a
                  className="button button-lime hero-cta"
                  href="#launch"
                >
                  앱 출시 준비 중{" "}
                  <span className="button-circle">
                    <ArrowDown aria-hidden="true" size={19} />
                  </span>
                </a>
                <a className="explore-link" href="#about">
                  조금 더 알아보기 <ArrowDown aria-hidden="true" size={16} />
                </a>
              </div>
            </div>
            <div
              className="hero-collage"
              aria-label="일상, 여행, 공연의 순간을 담은 샘플 사진 콜라주"
            >
              <span className="collage-cross cross-one">+</span>
              <span className="collage-cross cross-two">+</span>
              <figure className="photo-print print-concert">
                <img
                  src={photos[2].src}
                  alt={photos[2].alt}
                  fetchPriority="high"
                />
                <figcaption>
                  <span>LOUD NIGHTS, REAL MEMORIES.</span>
                  <span>03 / 04</span>
                </figcaption>
              </figure>
              <figure className="photo-print print-main">
                <span className="tape" />
                <img
                  src={photos[0].src}
                  alt={photos[0].alt}
                  fetchPriority="high"
                />
                <figcaption>
                  <span>
                    <span className="tiny-dot" /> A MOMENT. NOT A PROMPT.
                  </span>
                  <span>↗</span>
                </figcaption>
              </figure>
              <figure className="photo-print print-ocean">
                <img
                  src={photos[1].src}
                  alt={photos[1].alt}
                  fetchPriority="high"
                />
                <figcaption>
                  <span>WISH YOU WERE HERE.</span>
                  <Heart aria-hidden="true" size={13} />
                </figcaption>
              </figure>
              <Stamp />
              <div className="handwritten-note">
                a little messy.
                <br />a lot more human.
                <svg viewBox="0 0 85 46" aria-hidden="true">
                  <path d="M5 4c9 31 38 39 66 24m-14-4 15 3-8 13" />
                </svg>
              </div>
              <span className="collage-source mono">
                LIFE IN FRAMES / SAMPLE PHOTOGRAPHY
              </span>
            </div>
          </div>
          <div className="hero-bottom">
            <span>
              <Camera aria-hidden="true" size={15} /> 카메라에서 시작되는 새로운
              소셜
            </span>
            <span className="mono">
              GO OUT. FEEL SOMETHING. <ArrowDown aria-hidden="true" size={15} />
            </span>
          </div>
        </section>

        <div
          className="manifesto-strip"
          aria-label="No AI. No uploads. Just real life."
        >
          <div>
            <span>NO AI.</span>
            <span className="strip-star">✳</span>
            <span>NO UPLOADS.</span>
            <span className="strip-star">✳</span>
            <span>JUST REAL LIFE.</span>
            <span className="strip-star">✳</span>
            <span aria-hidden="true">NO AI.</span>
            <span className="strip-star" aria-hidden="true">
              ✳
            </span>
            <span aria-hidden="true">NO UPLOADS.</span>
          </div>
        </div>

        <section id="about" className="manifesto-section">
          <div className="shell">
            <div className="section-topline">
              <span className="eyebrow">01 / THE MANIFESTO</span>
              <span className="mono">A SOCIAL RESET.</span>
            </div>
            <div className="manifesto-heading reveal">
              <h2>
                좋은 순간에
                <br />
                <span>프롬프트는</span>
                <br />
                필요 없으니까<span className="lime-period">.</span>
              </h2>
              <div className="manifesto-copy">
                <span className="asterisk">✳</span>
                <p>
                  너무 완벽한 얼굴, 한 번도 가본 적 없는 곳.
                  <br />
                  언제부터 우리는 만들어진 일상을
                  <br />
                  스크롤하고 있었을까요?
                </p>
                <p>
                  nepeel은 소셜의 시작점을 바꿉니다.
                  <br />더 그럴듯한 이미지가 아니라,
                  <br />
                  <strong>당신이 정말 거기 있었다는 것.</strong>
                </p>
                <a href="#how-it-works" className="text-button light-link">
                  우리의 방식 알아보기{" "}
                  <ArrowUpRight aria-hidden="true" size={18} />
                </a>
              </div>
            </div>
            <div className="rules-grid reveal">
              <article>
                <div className="rule-top">
                  <span className="mono">RULE 01</span>
                  <ImageOff aria-hidden="true" size={25} />
                </div>
                <h3>가져오는 사진은, 없어요.</h3>
                <p>
                  갤러리 업로드 없이.
                  <br />
                  외부 이미지가 들어올 문부터 닫았어요.
                </p>
                <span className="rule-label">NO GALLERY UPLOADS</span>
              </article>
              <article>
                <div className="rule-top">
                  <span className="mono">RULE 02</span>
                  <Camera aria-hidden="true" size={25} />
                </div>
                <h3>시작은 언제나, 카메라.</h3>
                <p>
                  nepeel 앱으로 직접 찍은 사진만.
                  <br />
                  지금 눈앞의 장면이 콘텐츠가 됩니다.
                </p>
                <span className="rule-label">CAPTURED IN NEPEEL</span>
              </article>
              <article>
                <div className="rule-top">
                  <span className="mono">RULE 03</span>
                  <ShieldCheck aria-hidden="true" size={25} />
                </div>
                <h3>만든 이미지보다, 산 경험.</h3>
                <p>
                  AI 생성 이미지를 위한 자리는 없어요.
                  <br />
                  우리의 피드는 우리의 삶으로 채워요.
                </p>
                <span className="rule-label">HUMAN MOMENTS ONLY</span>
              </article>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="how-section shell">
          <div className="section-topline">
            <span className="eyebrow">02 / LESS STEPS. MORE LIFE.</span>
            <span className="mono">IT'S THAT SIMPLE.</span>
          </div>
          <div className="how-layout reveal">
            <div className="how-copy">
              <h2>
                찍고. 나누고.
                <br />
                <span className="serif-word">다시, 삶으로.</span>
              </h2>
              <p className="section-description">
                좋은 피드를 만드는 가장 단순한 방법.
                <br />
                그냥, 당신의 하루를 사는 것.
              </p>
              <div
                className="steps"
                role="tablist"
                aria-label="nepeel 사용 방법"
                aria-orientation="vertical"
              >
                {steps.map((item, i) => (
                  <button
                    id={`step-tab-${i}`}
                    className={`step ${step === i ? "active" : ""}`}
                    key={item.title}
                    role="tab"
                    aria-selected={step === i}
                    aria-controls="step-panel"
                    tabIndex={step === i ? 0 : -1}
                    onClick={() => setStep(i)}
                    onKeyDown={(e) => {
                      let next = i;
                      if (e.key === "ArrowDown") next = (i + 1) % steps.length;
                      else if (e.key === "ArrowUp")
                        next = (i + steps.length - 1) % steps.length;
                      else if (e.key === "Home") next = 0;
                      else if (e.key === "End") next = steps.length - 1;
                      else return;
                      e.preventDefault();
                      setStep(next);
                      document.getElementById(`step-tab-${next}`)?.focus();
                    }}
                  >
                    <span className="step-number mono">0{i + 1}</span>
                    <span>
                      <strong>{item.title}</strong>
                      {step === i && (
                        <span className="step-description">{item.body}</span>
                      )}
                    </span>
                    <ArrowUpRight aria-hidden="true" size={22} />
                  </button>
                ))}
              </div>
            </div>
            <div
              id="step-panel"
              className="phone-stage"
              role="tabpanel"
              aria-labelledby={`step-tab-${step}`}
              tabIndex={0}
            >
              <span className="stage-label mono">
                LESS SCROLLING.
                <br />
                MORE LIVING.
              </span>
              <span className="stage-cross">+</span>
              <div className="phone">
                <div className="phone-top">
                  <span className="mono">9:41</span>
                  <span className="phone-island" />
                  <span className="phone-status">••• ▰</span>
                </div>
                <div className="phone-app-header">
                  <Brand />
                  <span className="mono">PREVIEW</span>
                </div>
                <div className={`phone-photo step-${step}`}>
                  <img
                    src={photos[1].src}
                    alt="nepeel 앱 체험: 여름 바다 사진"
                    loading="lazy"
                  />
                  {step === 0 ? (
                    <>
                      <div className="viewfinder" />
                      <span className="phone-photo-label">
                        <span className="tiny-dot" /> YOUR NEXT MEMORY
                      </span>
                    </>
                  ) : step === 1 ? (
                    <span className="captured-label">
                      <Check aria-hidden="true" size={16} /> THIS MOMENT IS
                      YOURS.
                    </span>
                  ) : (
                    <div className="feed-overlay">
                      <span>잠깐, 여름에 다녀왔어.</span>
                      <Heart aria-hidden="true" size={19} />
                    </div>
                  )}
                </div>
                <div className="phone-controls">
                  {step === 0 ? (
                    <>
                      <ImageOff aria-hidden="true" size={20} />
                      <button
                        className="shutter small"
                        onClick={() => setStep(1)}
                        aria-label="촬영 단계 보기"
                      >
                        <span />
                      </button>
                      <span className="mono">1×</span>
                    </>
                  ) : step === 1 ? (
                    <>
                      <button
                        className="text-button"
                        onClick={() => setStep(0)}
                      >
                        다시 찍기
                      </button>
                      <button className="mini-share" onClick={() => setStep(2)}>
                        공유하기 <ArrowUpRight aria-hidden="true" size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="phone-feed-label">
                        <CheckCheck aria-hidden="true" size={18} /> 우리의
                        순간에 추가
                      </span>
                      <button
                        className="icon-button"
                        aria-label="카메라 단계로 돌아가기"
                        onClick={() => setStep(0)}
                      >
                        <Camera aria-hidden="true" size={20} />
                      </button>
                    </>
                  )}
                </div>
                <span className="phone-home" />
              </div>
              <span className="camera-only-tag">
                <Camera aria-hidden="true" size={19} /> CAMERA ONLY.
                <br />
                <strong>ALWAYS.</strong>
              </span>
              <span className="phone-footnote mono">
                {steps[step].label} / SAMPLE APP SCREEN
              </span>
            </div>
          </div>
        </section>

        <section id="moments" className="moments-section">
          <div className="shell">
            <div className="section-topline">
              <span className="eyebrow">03 / BEAUTIFULLY ORDINARY</span>
              <span className="mono">LIFE DOESN'T NEED A FILTER.</span>
            </div>
            <div className="moments-heading reveal">
              <h2>
                별거 아닌 순간이,
                <br />
                우리의 전부니까.
              </h2>
              <div>
                <p>
                  조금 흔들리고, 가끔은 엉뚱하고.
                  <br />
                  그래서 더 오래 기억하고 싶은 장면들.
                </p>
                <span className="sample-disclaimer">
                  서비스 분위기를 보여주는 샘플 사진입니다.
                </span>
              </div>
            </div>
            <div className="gallery-toolbar">
              <div className="gallery-filters" aria-label="사진 카테고리">
                {["전체", "일상", "여행", "함께"].map((category) => (
                  <button
                    key={category}
                    className={filter === category ? "active" : ""}
                    aria-pressed={filter === category}
                    onClick={() => setFilter(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <span className="mono gallery-count" aria-live="polite">
                {String(
                  photos.filter(
                    (p) => filter === "전체" || p.category === filter,
                  ).length,
                ).padStart(2, "0")}{" "}
                MOMENTS
              </span>
            </div>
            <div className="moment-gallery">
              {photos.map(
                (photo, i) =>
                  (filter === "전체" || photo.category === filter) && (
                    <button
                      className={`moment-card moment-${i}`}
                      key={photo.frame}
                      onClick={() => setSelectedPhoto(i)}
                      aria-label={`${photo.title} 사진 크게 보기`}
                    >
                      <div className="moment-image">
                        <img src={photo.src} alt={photo.alt} loading="lazy" />
                        <span className="moment-expand">
                          <ArrowUpRight aria-hidden="true" size={21} />
                        </span>
                        <span className="moment-frame mono">
                          FRAME / {photo.frame}
                        </span>
                      </div>
                      <div className="moment-caption">
                        <h3>{photo.title}</h3>
                        <span className="mono">{photo.place}</span>
                      </div>
                    </button>
                  ),
              )}
            </div>
          </div>
        </section>

        <section className="faq-section shell">
          <div className="faq-intro">
            <span className="eyebrow">A FEW THINGS TO KNOW</span>
            <h2>
              궁금한 게<br />
              있다면<span className="lime-period">?</span>
            </h2>
            <span className="faq-scribble">let's keep it real.</span>
          </div>
          <div className="faq-list">
            {faqs.map((faq, i) => (
              <details key={faq.q}>
                <summary>
                  <span className="mono">0{i + 1}</span>
                  <h3>{faq.q}</h3>
                  <Plus aria-hidden="true" size={21} />
                </summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="launch" className="closing-section" aria-labelledby="launch-title">
          <div className="shell closing-inner">
            <span className="eyebrow">
              <span className="live-dot" /> COMING SOON / NEPEEL
            </span>
            <h2 id="launch-title">
              진짜의 시작,
              <br />
              <span>준비 중.</span>
              <svg
                className="closing-arrow"
                viewBox="0 0 150 150"
                fill="none"
                aria-hidden="true"
              >
                <path d="M15 125 126 17M40 19l88-3-1 89" />
              </svg>
            </h2>
            <div className="closing-bottom">
              <p>
                직접 찍은 순간으로 연결되는 세상을 준비하고 있어요.
                <br />
                앱 출시 소식은 이곳에서 가장 먼저 전할게요.
              </p>
              <button className="button button-dark" onClick={openExperience}>
                서비스 미리보기{" "}
                <ArrowUpRight aria-hidden="true" size={20} />
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer shell">
        <div className="footer-top">
          <a href="#" aria-label="nepeel 맨 위로">
            <Brand large />
          </a>
          <span className="footer-motto">
            LESS FAKE.
            <br />
            MORE LIFE.
          </span>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} nepeel</span>
          <span>오직 우리가 찍은, 우리의 세상.</span>
          <div>
            <button
              className="text-button"
              aria-expanded={creditsOpen}
              onClick={() => setCreditsOpen(!creditsOpen)}
            >
              Photo credits <ChevronDown aria-hidden="true" size={14} />
            </button>
            <a href="#main">Back to top ↑</a>
          </div>
        </div>
        {creditsOpen && (
          <div className="photo-credits">
            <p>
              사이트의 사진은 nepeel 게시물이 아닌 Unsplash 샘플 사진입니다.
            </p>
            <div>
              {photos.map((p) => (
                <a
                  key={p.frame}
                  href={p.source}
                  target="_blank"
                  rel="noreferrer"
                >
                  {p.place} <ArrowUpRight aria-hidden="true" size={12} />
                </a>
              ))}
            </div>
            <a href="/photo-credits.txt" target="_blank" rel="noreferrer">
              원본 이미지 출처 전체 보기 ↗
            </a>
          </div>
        )}
      </footer>

      <Experience
        open={experienceOpen}
        onClose={() => setExperienceOpen(false)}
      />
      <dialog
        ref={photoDialog}
        className="photo-dialog"
        aria-label="샘플 사진 크게 보기"
        onCancel={() => setSelectedPhoto(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelectedPhoto(null);
        }}
      >
        {selectedPhoto !== null && (
          <div className="lightbox-inner">
            <button
              className="icon-button lightbox-close"
              aria-label="사진 닫기"
              onClick={() => setSelectedPhoto(null)}
            >
              <X aria-hidden="true" />
            </button>
            <img
              src={photos[selectedPhoto].src}
              alt={photos[selectedPhoto].alt}
            />
            <div className="lightbox-caption">
              <div>
                <span className="eyebrow">
                  SAMPLE MOMENT / {photos[selectedPhoto].frame}
                </span>
                <h2>{photos[selectedPhoto].title}</h2>
              </div>
              <div className="lightbox-controls">
                <button
                  className="icon-button"
                  aria-label="이전 사진"
                  onClick={() =>
                    setSelectedPhoto(
                      (selectedPhoto + photos.length - 1) % photos.length,
                    )
                  }
                >
                  <ArrowLeft aria-hidden="true" />
                </button>
                <button
                  className="icon-button"
                  aria-label="다음 사진"
                  onClick={() =>
                    setSelectedPhoto((selectedPhoto + 1) % photos.length)
                  }
                >
                  <ArrowRight aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
