-- scripts/docker/init-auth-db.sql
-- Auth DB 초기화 (Docker Swarm 테스트 환경)
-- MySQL entrypoint에서 자동 실행됨

-- tb_user_group
CREATE TABLE IF NOT EXISTS `tb_user_group` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(30) NOT NULL COMMENT '그룹명',
  `type` varchar(20) NOT NULL COMMENT '그룹 구분',
  `use_yn` varchar(2) NOT NULL COMMENT '사용 여부',
  `email` varchar(400) DEFAULT NULL COMMENT '그룹 대표 이메일',
  `created_adm` varchar(50) NOT NULL COMMENT '생성자',
  `created_at` datetime(6) NOT NULL COMMENT '생성일시',
  `updated_adm` varchar(50) DEFAULT NULL COMMENT '수정자',
  `updated_at` datetime(6) DEFAULT NULL COMMENT '수정일시',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_user_group_01` (`name`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- tb_account
CREATE TABLE IF NOT EXISTS `tb_account` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `email` varchar(64) DEFAULT NULL COMMENT '이메일',
  `fail_count` int DEFAULT 0 COMMENT '로그인 실패 카운트',
  `last_login_at` datetime(6) DEFAULT NULL COMMENT '마지막 로그인 시간',
  `login_id` varbinary(63) NOT NULL COMMENT '로그인 ID',
  `name` varchar(255) DEFAULT NULL COMMENT '이름',
  `user_type` varchar(20) NOT NULL COMMENT '사용자 계정 구분',
  `password` varchar(255) DEFAULT NULL COMMENT '비밀번호 [암호화]',
  `status` varchar(255) DEFAULT NULL COMMENT '사용자 상태',
  `otp_secret_key` varchar(20) DEFAULT NULL COMMENT '사용자별 OTP 암호키',
  `customer_no` varchar(40) DEFAULT NULL COMMENT '고객사 번호',
  `last_password_changed_at` datetime(6) DEFAULT NULL COMMENT '마지막 패스워드 변경 일시',
  `updated_at` datetime(6) DEFAULT NULL COMMENT '수정일시',
  `ktms_access_yn` varchar(2) DEFAULT NULL COMMENT 'KTMS 접근 가능 여부',
  `user_group_id` bigint DEFAULT NULL COMMENT '유저 그룹 ID',
  `role_type` varchar(20) DEFAULT NULL COMMENT '유저 권한 구분',
  `menu_group_id` bigint DEFAULT NULL COMMENT '메뉴 권한 그룹 ID',
  `cash_courier_yn` varchar(3) NOT NULL DEFAULT 'N' COMMENT '현금 수송 담당자 여부',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_account_01` (`login_id`,`user_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 테스트용 계정 데이터 (패스워드: admin123 → bcryptjs hash)
INSERT INTO `tb_user_group` (`id`, `name`, `type`, `use_yn`, `created_adm`, `created_at`)
VALUES (1, 'Admin Group', 'ADMIN_BO', 'Y', 'system', NOW());

INSERT INTO `tb_account` (`login_id`, `name`, `user_type`, `password`, `status`, `role_type`, `customer_no`, `user_group_id`, `otp_secret_key`, `last_password_changed_at`, `created_at`)
VALUES
  ('admin', '관리자', 'ADMIN_BO', '{bcrypt}$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'ACTIVE', 'ADMIN', 'C001', 1, 'JBSWY3DPEHPK3PXP', NOW(), NOW()),
  ('dashboard', '대시보드', 'DASHBOARD', '{bcrypt}$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'ACTIVE', 'VIEWER', 'C002', 1, NULL, NOW(), NOW());
