package protocol

func S2MInitAssets(programUrl string, programHash []byte, imageNames []string, imageUrls []string, imageHashes [][]byte) []byte {
	packet := NewPacket()
	packet.U8(0)
	packet.String(programUrl)
	packet.FixedBytes(programHash)
	packet.U8(uint8(len(imageNames)))
	for i := 0; i < len(imageNames); i++ {
		packet.String(imageNames[i])
		packet.String(imageUrls[i])
		packet.FixedBytes(imageHashes[i])
	}

	return packet.ToBuffer()
}
