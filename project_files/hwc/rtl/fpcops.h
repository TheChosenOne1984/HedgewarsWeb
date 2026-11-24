#pragma once

/*
 * Integer operators with Free Pascal semantics (64-bit targets).
 *
 * pas2c emits these instead of the plain C operators, because FPC and C
 * disagree on integer expression typing:
 *
 *  - FPC evaluates + - * (and unary -) on ordinal operands in the native
 *    integer type, Int64 on 64-bit targets. C evaluates them in int or
 *    unsigned int and wraps.
 *  - When a signed operand meets an unsigned one (e.g. LongInt and Byte or
 *    LongWord), FPC evaluates or/xor and comparisons in Int64. C promotes
 *    small types to int and converts signed to unsigned for LongWord.
 *  - and/or/xor of two unsigned operands keep the larger operand type in
 *    FPC (Byte and Byte is a Byte); C promotes to int.
 *  - shr is a logical shift in FPC, performed in the width of the (at least
 *    32-bit) left operand type. C's >> is arithmetic for signed operands.
 *    Byte and Word are shifted as unsigned 32-bit values; C promotes them to
 *    int.
 *  - Signed overflow wraps in FPC. The C code must be compiled with -fwrapv.
 *  - not keeps the operand type (not Byte is a Byte). C promotes to int.
 *
 * The selection uses _Generic on the actual C types, so it is exact and
 * costs nothing at run time. The reference is FPC on x86_64, which desktop
 * players run; the determinism gate and tests/pas2c-semantics check this.
 */

#include <stdint.h>

/* 1 if the expression has a signed integer type of at most 32 bits */
#define FPCRTL_S32(x) _Generic((x), \
    signed char: 1, short: 1, int: 1, long: (sizeof(long) == 4), default: 0)

/* 1 if the expression has an unsigned integer type of at most 32 bits */
#define FPCRTL_U32(x) _Generic((x), \
    unsigned char: 1, unsigned short: 1, unsigned int: 1, \
    unsigned long: (sizeof(long) == 4), default: 0)

/* 1 if the expression has an integer type of at most 32 bits */
#define FPCRTL_I32(x) _Generic((x), \
    char: 1, signed char: 1, unsigned char: 1, short: 1, unsigned short: 1, \
    int: 1, unsigned int: 1, \
    long: (sizeof(long) == 4), unsigned long: (sizeof(long) == 4), default: 0)

/* 1 if the expression has a signed integer type (any width) */
#define FPCRTL_SIGNED(x) _Generic((x), \
    signed char: 1, short: 1, int: 1, long: 1, long long: 1, default: 0)

/* 1 if the expression has an unsigned 64-bit integer type */
#define FPCRTL_U64(x) _Generic((x), \
    unsigned long: (sizeof(long) == 8), unsigned long long: 1, default: 0)

/* signed meets unsigned, both at most 32 bits: FPC evaluates in Int64 */
#define FPCRTL_MIXED32(a, b) \
    ((FPCRTL_S32(a) && FPCRTL_U32(b)) || (FPCRTL_U32(a) && FPCRTL_S32(b)))

/* 1 if the expression has a signed 64-bit integer type */
#define FPCRTL_S64(x) _Generic((x), \
    long: (sizeof(long) == 8), long long: 1, default: 0)

/* QWord meets a signed type: FPC evaluates div and mod in Int64 */
#define FPCRTL_MIXED64(a, b) \
    ((FPCRTL_U64(a) && FPCRTL_SIGNED(b)) || (FPCRTL_SIGNED(a) && FPCRTL_U64(b)))

/* QWord meets Int64: FPC evaluates everything in Int64 (a smaller signed
   operand meeting QWord gives QWord, like C) */
#define FPCRTL_MIXEDQ64(a, b) \
    ((FPCRTL_U64(a) && FPCRTL_S64(b)) || (FPCRTL_S64(a) && FPCRTL_U64(b)))

#define FPCRTL_BOTHU32(a, b) (FPCRTL_U32(a) && FPCRTL_U32(b))

/* select expression t if cond (an integer constant expression) holds, else f */
#define FPCRTL_IF(cond, t, f) _Generic((char (*)[1 + !!(cond)])0, char (*)[2]: (t), default: (f))

/* widen an integer of at most 32 bits to Int64, leave anything else alone */
#define fpcrtl_w64(x) FPCRTL_IF(FPCRTL_I32(x), (int64_t)(x), (x))

/*
 * Every operand is evaluated exactly once into a temporary (GNU statement
 * expression + __auto_type), so nesting does not blow up the expansion and
 * the selection macros only ever see the identifiers __fpc_l and __fpc_r.
 */
#define FPCRTL_LET2(a, b, expr) \
    __extension__ ({ __auto_type __fpc_l = (a); __auto_type __fpc_r = (b); expr; })
#define FPCRTL_LET1(a, expr) \
    __extension__ ({ __auto_type __fpc_l = (a); expr; })

/* operand conversion for native int arithmetic: Int64 for operands of at
   most 32 bits and for QWord meeting Int64, otherwise C's rules */
#define FPCRTL_NAT(x) \
    FPCRTL_IF(FPCRTL_MIXEDQ64(__fpc_l, __fpc_r), (int64_t)(x), fpcrtl_w64(x))

/* div mod: like FPCRTL_NAT, but QWord meeting a signed type gives Int64 */
#define FPCRTL_NATD(x) \
    FPCRTL_IF(FPCRTL_MIXED64(__fpc_l, __fpc_r), (int64_t)(x), fpcrtl_w64(x))

/* like FPCRTL_NAT, but two unsigned operands of at most 32 bits give QWord */
#define FPCRTL_NATU(x) \
    FPCRTL_IF(FPCRTL_BOTHU32(__fpc_l, __fpc_r), (uint64_t)(x), FPCRTL_NAT(x))

/* operand conversion for comparisons: compare mathematically */
#define FPCRTL_LOG(x) \
    FPCRTL_IF(FPCRTL_BOTHU32(__fpc_l, __fpc_r), (uint32_t)(x), \
    FPCRTL_IF(FPCRTL_MIXED32(__fpc_l, __fpc_r) || FPCRTL_MIXEDQ64(__fpc_l, __fpc_r), (int64_t)(x), (x)))

/* the larger of the two (unsigned) operand types */
#define FPCRTL_UMAX(v) \
    FPCRTL_IF(sizeof(__fpc_l) >= sizeof(__fpc_r), (__typeof__(__fpc_l))(v), (__typeof__(__fpc_r))(v))

/* and: two unsigned operands keep the larger type (Byte and Byte is a Byte),
   otherwise C's rules: the unsigned type wins (LongInt and LongWord gives
   LongWord, Int64 and QWord gives QWord) */
#define FPCRTL_BITAND \
    FPCRTL_IF(FPCRTL_BOTHU32(__fpc_l, __fpc_r), FPCRTL_UMAX(__fpc_l & __fpc_r), __fpc_l & __fpc_r)

/* or xor: two unsigned operands keep the larger type, signed meeting
   unsigned (both at most 32 bits) gives Int64, otherwise C's rules */
#define FPCRTL_BITOP(op) \
    FPCRTL_IF(FPCRTL_BOTHU32(__fpc_l, __fpc_r), FPCRTL_UMAX(__fpc_l op __fpc_r), \
    FPCRTL_IF(FPCRTL_MIXED32(__fpc_l, __fpc_r) || FPCRTL_MIXEDQ64(__fpc_l, __fpc_r), \
        (int64_t)(__fpc_l) op (int64_t)(__fpc_r), __fpc_l op __fpc_r))

/*
 * Constants: FPC gives a non-negative constant the type of the other operand
 * if it fits (so "QWordVar < 0" compares unsigned). pas2c emits the _cl/_cr
 * variants when the left/right operand is a non-negative integer literal.
 */
#define FPCRTL_FITS(v, c) _Generic((v), \
    signed char: (c) <= 127, unsigned char: (c) <= 255, \
    short: (c) <= 32767, unsigned short: (c) <= 65535, \
    int: (c) <= 2147483647, unsigned int: (c) <= 4294967295u, \
    long: 1, unsigned long: 1, long long: 1, unsigned long long: 1, \
    default: 0)
#define FPCRTL_FIT(v, c) FPCRTL_IF((c) >= 0 && FPCRTL_FITS(v, c), (__typeof__(v))(c), (c))
#define FPCRTL_LETCR(a, c, expr) \
    __extension__ ({ __auto_type __fpc_l = (a); __auto_type __fpc_r = FPCRTL_FIT(__fpc_l, c); expr; })
#define FPCRTL_LETCL(c, b, expr) \
    __extension__ ({ __auto_type __fpc_r = (b); __auto_type __fpc_l = FPCRTL_FIT(__fpc_r, c); expr; })

/* + * : native int; QWord for two unsigned operands */
#define FPCRTL_ADD FPCRTL_NATU(__fpc_l) + FPCRTL_NATU(__fpc_r)
#define FPCRTL_MUL FPCRTL_NATU(__fpc_l) * FPCRTL_NATU(__fpc_r)
/* - div mod : native int (Int64) */
#define FPCRTL_SUB FPCRTL_NAT(__fpc_l) - FPCRTL_NAT(__fpc_r)
#define FPCRTL_DIV FPCRTL_NATD(__fpc_l) / FPCRTL_NATD(__fpc_r)
#define FPCRTL_MOD FPCRTL_NATD(__fpc_l) % FPCRTL_NATD(__fpc_r)
#define FPCRTL_AND FPCRTL_BITAND
#define FPCRTL_OR  FPCRTL_BITOP(|)
#define FPCRTL_XOR FPCRTL_BITOP(^)
#define FPCRTL_CMP(op) FPCRTL_LOG(__fpc_l) op FPCRTL_LOG(__fpc_r)

#define fpcrtl_add(a, b) FPCRTL_LET2(a, b, FPCRTL_ADD)
#define fpcrtl_sub(a, b) FPCRTL_LET2(a, b, FPCRTL_SUB)
#define fpcrtl_mul(a, b) FPCRTL_LET2(a, b, FPCRTL_MUL)
#define fpcrtl_div(a, b) FPCRTL_LET2(a, b, FPCRTL_DIV)
#define fpcrtl_mod(a, b) FPCRTL_LET2(a, b, FPCRTL_MOD)
#define fpcrtl_and(a, b) FPCRTL_LET2(a, b, FPCRTL_AND)
#define fpcrtl_or(a, b)  FPCRTL_LET2(a, b, FPCRTL_OR)
#define fpcrtl_xor(a, b) FPCRTL_LET2(a, b, FPCRTL_XOR)
#define fpcrtl_cmp(a, op, b) FPCRTL_LET2(a, b, FPCRTL_CMP(op))

#define fpcrtl_add_cr(a, c) FPCRTL_LETCR(a, c, FPCRTL_ADD)
#define fpcrtl_sub_cr(a, c) FPCRTL_LETCR(a, c, FPCRTL_SUB)
#define fpcrtl_mul_cr(a, c) FPCRTL_LETCR(a, c, FPCRTL_MUL)
#define fpcrtl_div_cr(a, c) FPCRTL_LETCR(a, c, FPCRTL_DIV)
#define fpcrtl_mod_cr(a, c) FPCRTL_LETCR(a, c, FPCRTL_MOD)
#define fpcrtl_and_cr(a, c) FPCRTL_LETCR(a, c, FPCRTL_AND)
#define fpcrtl_or_cr(a, c)  FPCRTL_LETCR(a, c, FPCRTL_OR)
#define fpcrtl_xor_cr(a, c) FPCRTL_LETCR(a, c, FPCRTL_XOR)
#define fpcrtl_cmp_cr(a, op, c) FPCRTL_LETCR(a, c, FPCRTL_CMP(op))

#define fpcrtl_add_cl(c, b) FPCRTL_LETCL(c, b, FPCRTL_ADD)
#define fpcrtl_sub_cl(c, b) FPCRTL_LETCL(c, b, FPCRTL_SUB)
#define fpcrtl_mul_cl(c, b) FPCRTL_LETCL(c, b, FPCRTL_MUL)
#define fpcrtl_div_cl(c, b) FPCRTL_LETCL(c, b, FPCRTL_DIV)
#define fpcrtl_mod_cl(c, b) FPCRTL_LETCL(c, b, FPCRTL_MOD)
#define fpcrtl_and_cl(c, b) FPCRTL_LETCL(c, b, FPCRTL_AND)
#define fpcrtl_or_cl(c, b)  FPCRTL_LETCL(c, b, FPCRTL_OR)
#define fpcrtl_xor_cl(c, b) FPCRTL_LETCL(c, b, FPCRTL_XOR)
#define fpcrtl_cmp_cl(c, op, b) FPCRTL_LETCL(c, b, FPCRTL_CMP(op))

/* unary minus: Int64 (also for a QWord operand) */
#define fpcrtl_neg(a) FPCRTL_LET1(a, -FPCRTL_IF(FPCRTL_U64(__fpc_l), (int64_t)(__fpc_l), fpcrtl_w64(__fpc_l)))

/* logical shift right in the width of the (at least 32-bit) operand type */
#define FPCRTL_SHR(a, n) _Generic((a), \
    signed char: (int32_t)((uint32_t)(int32_t)(a) >> (n)), \
    short: (int32_t)((uint32_t)(int32_t)(a) >> (n)), \
    int: (int32_t)((uint32_t)(a) >> (n)), \
    long: (long)((unsigned long)(a) >> (n)), \
    long long: (long long)((unsigned long long)(a) >> (n)), \
    unsigned char: ((uint32_t)(a) >> (n)), \
    unsigned short: ((uint32_t)(a) >> (n)), \
    default: ((a) >> (n)))
#define fpcrtl_shr(a, n) FPCRTL_LET2(a, n, FPCRTL_SHR(__fpc_l, __fpc_r))

/* shift left in the width of the (at least 32-bit) operand type, wrapping */
#define FPCRTL_SHL(a, n) _Generic((a), \
    signed char: (int32_t)((uint32_t)(int32_t)(a) << (n)), \
    short: (int32_t)((uint32_t)(int32_t)(a) << (n)), \
    int: (int32_t)((uint32_t)(a) << (n)), \
    long: (long)((unsigned long)(a) << (n)), \
    long long: (long long)((unsigned long long)(a) << (n)), \
    unsigned char: ((uint32_t)(a) << (n)), \
    unsigned short: ((uint32_t)(a) << (n)), \
    default: ((a) << (n)))
#define fpcrtl_shl(a, n) FPCRTL_LET2(a, n, FPCRTL_SHL(__fpc_l, __fpc_r))

/* bitwise not keeps the operand type */
#define FPCRTL_NOT(a) _Generic((a), \
    unsigned char: (unsigned char)~(a), \
    unsigned short: (unsigned short)~(a), \
    signed char: (signed char)~(a), \
    short: (short)~(a), \
    default: ~(a))
#define fpcrtl_not(a) FPCRTL_LET1(a, FPCRTL_NOT(__fpc_l))
